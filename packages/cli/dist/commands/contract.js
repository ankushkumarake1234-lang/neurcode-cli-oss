"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contractCommand = contractCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const api_client_1 = require("../api-client");
const config_1 = require("../config");
const project_root_1 = require("../utils/project-root");
const state_1 = require("../utils/state");
const policy_packs_1 = require("../utils/policy-packs");
const policy_compiler_1 = require("../utils/policy-compiler");
const change_contract_1 = require("../utils/change-contract");
const artifact_signature_1 = require("../utils/artifact-signature");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (value) => value,
        yellow: (value) => value,
        red: (value) => value,
        bold: (value) => value,
        dim: (value) => value,
        cyan: (value) => value,
    };
}
function emitJson(payload) {
    console.log(JSON.stringify(payload, null, 2));
}
function hasPersistedPlanId(planId) {
    return typeof planId === 'string' && planId.trim().length > 0 && planId !== 'unknown';
}
async function readStdinText() {
    return new Promise((resolvePromise, reject) => {
        const chunks = [];
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (chunk) => {
            chunks.push(String(chunk));
        });
        process.stdin.on('error', reject);
        process.stdin.on('end', () => {
            resolvePromise(chunks.join(''));
        });
        process.stdin.resume();
    });
}
function parseAsJsonIfPossible(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    try {
        return JSON.parse(trimmed);
    }
    catch {
        return null;
    }
}
async function resolveImportPayload(projectRoot, options) {
    if (options.text && options.text.trim()) {
        return {
            source: 'inline',
            planText: options.text.trim(),
        };
    }
    if (options.input && options.input.trim()) {
        const inputPath = (0, path_1.resolve)(projectRoot, options.input.trim());
        if (!(0, fs_1.existsSync)(inputPath)) {
            throw new Error(`Input file not found: ${inputPath}`);
        }
        const raw = (0, fs_1.readFileSync)(inputPath, 'utf-8');
        const parsed = parseAsJsonIfPossible(raw);
        if (parsed !== null) {
            return {
                source: 'file',
                planJson: parsed,
            };
        }
        return {
            source: 'file',
            planText: raw,
        };
    }
    const shouldReadStdin = options.stdin === true || !process.stdin.isTTY;
    if (shouldReadStdin) {
        const raw = await readStdinText();
        if (!raw.trim()) {
            throw new Error('Stdin was empty. Provide plan text or JSON via stdin.');
        }
        const parsed = parseAsJsonIfPossible(raw);
        if (parsed !== null) {
            return {
                source: 'stdin',
                planJson: parsed,
            };
        }
        return {
            source: 'stdin',
            planText: raw,
        };
    }
    throw new Error('Provide one of --text, --input <path>, or --stdin to import an external plan.');
}
function contractCommand(program) {
    const contract = program
        .command('contract')
        .description('Manage imported intent/change contracts from external AI planners');
    contract
        .command('import')
        .description('Import an external AI-generated implementation plan and bind it to Neurcode verify flow')
        .option('--provider <provider>', 'Plan source provider (claude | cursor | codex | chatgpt | generic)', 'generic')
        .option('--project-id <id>', 'Project ID override')
        .option('--intent <text>', 'Intent override for imported plan')
        .option('--title <text>', 'Title override for imported plan')
        .option('--input <path>', 'Read plan payload from file (JSON or markdown/text)')
        .option('--text <payload>', 'Inline plan payload (JSON or plain text)')
        .option('--stdin', 'Read plan payload from stdin')
        .option('--no-write-change-contract', 'Skip writing .neurcode/change-contract.json')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const startedAt = Date.now();
        try {
            const config = (0, config_1.loadConfig)();
            if (!config.apiKey) {
                config.apiKey = (0, config_1.requireApiKey)();
            }
            const client = new api_client_1.ApiClient(config);
            const payload = await resolveImportPayload(projectRoot, options);
            const response = await client.importExternalPlan({
                provider: options.provider,
                projectId: options.projectId,
                intent: options.intent,
                title: options.title,
                planText: payload.planText,
                planJson: payload.planJson,
            });
            let changeContractPayload = null;
            if (options.writeChangeContract !== false && hasPersistedPlanId(response.planId)) {
                const expectedFiles = response.plan.files
                    .filter((file) => file.action !== 'BLOCK')
                    .map((file) => file.path);
                const policyLock = (0, policy_packs_1.readPolicyLockFile)(projectRoot);
                const compiledPolicy = (0, policy_compiler_1.readCompiledPolicyArtifact)(projectRoot);
                const unsignedContract = (0, change_contract_1.createChangeContract)({
                    planId: response.planId,
                    sessionId: response.sessionId || null,
                    projectId: options.projectId || null,
                    intent: options.intent || response.plan.summary || 'imported-plan',
                    expectedFiles,
                    policyLockFingerprint: policyLock.lock?.effective.fingerprint || null,
                    compiledPolicyFingerprint: compiledPolicy.artifact?.fingerprint || null,
                });
                const signedContract = (0, artifact_signature_1.signGovernanceArtifact)(unsignedContract, (0, artifact_signature_1.resolveGovernanceArtifactSigningConfigFromEnv)());
                const contractPath = (0, change_contract_1.writeChangeContract)(projectRoot, signedContract);
                changeContractPayload = {
                    id: signedContract.contractId,
                    path: contractPath,
                };
            }
            if (hasPersistedPlanId(response.planId)) {
                (0, state_1.setActivePlanId)(response.planId);
                (0, state_1.setLastPlanGeneratedAt)(new Date().toISOString());
            }
            if (response.sessionId && typeof response.sessionId === 'string') {
                (0, state_1.setSessionId)(response.sessionId);
            }
            if (options.json) {
                emitJson({
                    success: true,
                    provider: response.provider,
                    planId: response.planId,
                    sessionId: response.sessionId || null,
                    projectId: options.projectId || null,
                    parseMode: response.parseMode,
                    importedFiles: response.importedFiles,
                    warnings: response.warnings || [],
                    changeContract: changeContractPayload,
                    message: response.message,
                    timestamp: response.timestamp,
                    plan: response.plan,
                });
                return;
            }
            console.log(chalk.bold.cyan('\n📥 Neurcode Contract Import\n'));
            console.log(chalk.dim(`Provider: ${response.provider}`));
            console.log(chalk.dim(`Parse mode: ${response.parseMode}`));
            console.log(chalk.dim(`Imported files: ${response.importedFiles}`));
            if (response.planId) {
                console.log(chalk.green(`Plan ID: ${response.planId}`));
            }
            if (response.sessionId) {
                console.log(chalk.dim(`Session ID: ${response.sessionId}`));
            }
            if (changeContractPayload) {
                console.log(chalk.dim(`Change contract: ${changeContractPayload.path}`));
            }
            if ((response.warnings || []).length > 0) {
                console.log(chalk.yellow('\nWarnings:'));
                for (const warning of response.warnings) {
                    console.log(chalk.yellow(`  • ${warning}`));
                }
            }
            console.log(chalk.green(`\n✅ ${response.message}`));
            console.log(chalk.dim(`Completed in ${Date.now() - startedAt}ms\n`));
            console.log(chalk.dim('Next: run `neurcode verify --record --enforce-change-contract`'));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (options.json) {
                emitJson({
                    success: false,
                    provider: options.provider || null,
                    planId: null,
                    sessionId: null,
                    projectId: options.projectId || null,
                    parseMode: null,
                    importedFiles: 0,
                    warnings: [],
                    changeContract: null,
                    message,
                    timestamp: new Date().toISOString(),
                });
                process.exit(1);
            }
            console.error(chalk.red(`\n❌ Contract import failed: ${message}\n`));
            console.log(chalk.dim('Provide one of: --text, --input <path>, or --stdin'));
            console.log(chalk.dim('Examples:'));
            console.log(chalk.dim('  neurcode contract import --provider claude --input ./plan.md'));
            console.log(chalk.dim('  cat plan.json | neurcode contract import --provider cursor --stdin\n'));
            process.exit(1);
        }
    });
}
//# sourceMappingURL=contract.js.map