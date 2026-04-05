"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapCommand = bootstrapCommand;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const project_root_1 = require("../utils/project-root");
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
function stripAnsi(value) {
    return value.replace(/\u001b\[[0-9;]*m/g, '');
}
function extractLastJsonObject(output) {
    const clean = stripAnsi(output).trim();
    const end = clean.lastIndexOf('}');
    if (end === -1)
        return null;
    for (let start = end; start >= 0; start -= 1) {
        if (clean[start] !== '{')
            continue;
        const candidate = clean.slice(start, end + 1);
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        }
        catch {
            // Keep searching until parseable JSON object is found.
        }
    }
    return null;
}
function asString(record, key) {
    if (!record)
        return null;
    const value = record[key];
    return typeof value === 'string' ? value : null;
}
function asNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
async function runCliJson(commandArgs, cwd) {
    const args = commandArgs.includes('--json') ? [...commandArgs] : [...commandArgs, '--json'];
    const stdoutChunks = [];
    const stderrChunks = [];
    const exitCode = await new Promise((resolvePromise, reject) => {
        const child = (0, child_process_1.spawn)(process.execPath, [process.argv[1], ...args], {
            cwd,
            env: {
                ...process.env,
                CI: process.env.CI || 'true',
                FORCE_COLOR: '0',
            },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        child.stdout.on('data', (chunk) => stdoutChunks.push(String(chunk)));
        child.stderr.on('data', (chunk) => stderrChunks.push(String(chunk)));
        child.on('error', (error) => reject(error));
        child.on('close', (code) => resolvePromise(typeof code === 'number' ? code : 1));
    });
    const stdout = stdoutChunks.join('');
    const stderr = stderrChunks.join('');
    const payload = extractLastJsonObject(`${stdout}\n${stderr}`);
    return {
        exitCode,
        stdout,
        stderr,
        payload,
        command: args,
    };
}
function emitJson(payload) {
    console.log(JSON.stringify(payload, null, 2));
}
function hasPlanImportInput(options) {
    return Boolean((options.planInput && options.planInput.trim())
        || (options.planText && options.planText.trim())
        || options.planStdin === true);
}
function hasExistingChangeContract(projectRoot) {
    return (0, fs_1.existsSync)(`${projectRoot}/.neurcode/change-contract.json`);
}
function shouldFallbackToAdvisory(result) {
    const message = (asString(result.payload, 'message')
        || result.stderr
        || result.stdout
        || '').toLowerCase();
    return (message.includes('change contract missing')
        || message.includes('planid missing')
        || message.includes('plan mismatch'));
}
async function bootstrapCommand(options = {}) {
    const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const pack = (options.pack && options.pack.trim()) || 'soc2';
    const provider = (options.provider && options.provider.trim()) || 'generic';
    const strictGuard = options.strictGuard !== false;
    const allowAdvisoryFallback = options.allowAdvisoryFallback !== false;
    const stages = [];
    const recommendations = [];
    let finalMode = strictGuard ? 'strict' : 'advisory';
    try {
        const policyArgs = ['policy', 'bootstrap', pack];
        if (options.forcePack !== false) {
            policyArgs.push('--force');
        }
        if (options.intent && options.intent.trim()) {
            policyArgs.push('--intent', options.intent.trim());
            policyArgs.push('--require-deterministic-match');
        }
        else if (options.requireDeterministicMatch === true) {
            policyArgs.push('--require-deterministic-match');
        }
        if (options.includeDashboard === true) {
            policyArgs.push('--include-dashboard');
        }
        if (options.requireDashboard === true) {
            policyArgs.push('--require-dashboard');
        }
        const policyRun = await runCliJson(policyArgs, projectRoot);
        if (policyRun.exitCode !== 0) {
            stages.push({
                stage: 'policy_bootstrap',
                status: 'failed',
                command: policyRun.command,
                exitCode: policyRun.exitCode,
                message: asString(policyRun.payload, 'error') || 'Policy bootstrap failed.',
                payload: policyRun.payload,
            });
            const output = {
                success: false,
                mode: finalMode,
                stages,
                recommendations: [
                    'Fix policy bootstrap errors before continuing.',
                ],
                timestamp: new Date().toISOString(),
            };
            if (options.json) {
                emitJson(output);
            }
            else {
                console.log(chalk.bold.cyan('\n🚀 Neurcode Bootstrap\n'));
                console.log(chalk.red('❌ Policy bootstrap failed.'));
                console.log(chalk.dim(`   ${(stages[0].message || 'Unknown policy bootstrap error')}`));
            }
            process.exit(1);
        }
        stages.push({
            stage: 'policy_bootstrap',
            status: 'success',
            command: policyRun.command,
            exitCode: policyRun.exitCode,
            message: `Policy pack "${pack}" bootstrapped with deterministic compile.`,
            payload: policyRun.payload,
        });
        const bootstrapMeta = policyRun.payload && typeof policyRun.payload === 'object'
            ? policyRun.payload.bootstrap
            : undefined;
        const deterministicRuleCount = asNumber(bootstrapMeta?.deterministicRuleCount);
        const unmatchedStatements = Array.isArray(bootstrapMeta?.unmatchedStatements)
            ? bootstrapMeta.unmatchedStatements.length
            : 0;
        if (unmatchedStatements > 0 || deterministicRuleCount === 0) {
            recommendations.push('Increase deterministic coverage: rerun bootstrap with --intent "<enforceable rule>" and --require-deterministic-match');
        }
        let planIdFromContract = null;
        if (options.skipContract === true) {
            stages.push({
                stage: 'contract_import',
                status: 'skipped',
                command: null,
                exitCode: null,
                message: 'Skipped contract import (--skip-contract).',
            });
            recommendations.push('Import an external plan before strict governance: neurcode contract import --provider <provider> --input <path>');
        }
        else if (hasPlanImportInput(options)) {
            const contractArgs = ['contract', 'import', '--provider', provider];
            if (options.planInput && options.planInput.trim()) {
                contractArgs.push('--input', options.planInput.trim());
            }
            else if (options.planText && options.planText.trim()) {
                contractArgs.push('--text', options.planText.trim());
            }
            else if (options.planStdin === true) {
                contractArgs.push('--stdin');
            }
            const contractRun = await runCliJson(contractArgs, projectRoot);
            if (contractRun.exitCode !== 0) {
                stages.push({
                    stage: 'contract_import',
                    status: 'failed',
                    command: contractRun.command,
                    exitCode: contractRun.exitCode,
                    message: asString(contractRun.payload, 'message') || 'Contract import failed.',
                    payload: contractRun.payload,
                });
                const output = {
                    success: false,
                    mode: finalMode,
                    stages,
                    recommendations: [
                        'Fix contract import issues or run with --skip-contract to continue in policy-only advisory mode.',
                    ],
                    timestamp: new Date().toISOString(),
                };
                if (options.json) {
                    emitJson(output);
                }
                else {
                    console.log(chalk.bold.cyan('\n🚀 Neurcode Bootstrap\n'));
                    console.log(chalk.red('❌ Contract import failed.'));
                    console.log(chalk.dim(`   ${(stages[1].message || 'Unknown contract import error')}`));
                }
                process.exit(1);
            }
            planIdFromContract = asString(contractRun.payload, 'planId');
            stages.push({
                stage: 'contract_import',
                status: 'success',
                command: contractRun.command,
                exitCode: contractRun.exitCode,
                message: planIdFromContract
                    ? `Plan contract imported (${planIdFromContract}).`
                    : 'Plan contract imported.',
                payload: contractRun.payload,
            });
        }
        else if (hasExistingChangeContract(projectRoot)) {
            stages.push({
                stage: 'contract_import',
                status: 'success',
                command: null,
                exitCode: null,
                message: 'Using existing change contract at .neurcode/change-contract.json.',
            });
        }
        else {
            stages.push({
                stage: 'contract_import',
                status: 'skipped',
                command: null,
                exitCode: null,
                message: 'No plan input provided; contract import skipped.',
            });
            recommendations.push('Provide plan input on next run for strict guard startup: --plan-input <path> or --plan-text "<plan>"');
        }
        if (options.skipGuard === true) {
            stages.push({
                stage: 'guard_start',
                status: 'skipped',
                command: null,
                exitCode: null,
                message: 'Skipped runtime guard start (--skip-guard).',
            });
            recommendations.push('Start runtime guard before coding: neurcode guard start --strict');
        }
        else {
            const guardArgs = ['guard', 'start', strictGuard ? '--strict' : '--no-strict'];
            if (planIdFromContract) {
                guardArgs.push('--plan-id', planIdFromContract);
            }
            const guardRun = await runCliJson(guardArgs, projectRoot);
            if (guardRun.exitCode === 0) {
                stages.push({
                    stage: 'guard_start',
                    status: 'success',
                    command: guardRun.command,
                    exitCode: guardRun.exitCode,
                    message: strictGuard
                        ? 'Strict runtime guard started.'
                        : 'Advisory runtime guard started.',
                    payload: guardRun.payload,
                });
            }
            else if (strictGuard && allowAdvisoryFallback && shouldFallbackToAdvisory(guardRun)) {
                const advisoryRun = await runCliJson(['guard', 'start', '--no-strict'], projectRoot);
                if (advisoryRun.exitCode === 0) {
                    finalMode = 'advisory';
                    stages.push({
                        stage: 'guard_start',
                        status: 'success',
                        command: advisoryRun.command,
                        exitCode: advisoryRun.exitCode,
                        message: 'Strict runtime guard prerequisites missing; started advisory runtime guard fallback.',
                        payload: advisoryRun.payload,
                    });
                    recommendations.push('Upgrade to strict guard by importing a plan contract: neurcode contract import --provider <provider> --input <path>');
                }
                else {
                    stages.push({
                        stage: 'guard_start',
                        status: 'failed',
                        command: advisoryRun.command,
                        exitCode: advisoryRun.exitCode,
                        message: asString(advisoryRun.payload, 'message')
                            || asString(guardRun.payload, 'message')
                            || 'Runtime guard start failed.',
                        payload: advisoryRun.payload || guardRun.payload,
                    });
                }
            }
            else {
                stages.push({
                    stage: 'guard_start',
                    status: 'failed',
                    command: guardRun.command,
                    exitCode: guardRun.exitCode,
                    message: asString(guardRun.payload, 'message') || 'Runtime guard start failed.',
                    payload: guardRun.payload,
                });
            }
        }
        const success = stages.every((stage) => stage.status !== 'failed');
        if (success) {
            recommendations.push('Run guarded verify in CI/local: neurcode verify --compiled-policy neurcode.policy.compiled.json --enforce-change-contract --strict-artifacts');
            recommendations.push('Track quality drift with feedback loop: neurcode feedback stats --org-wide --days 30 --limit 10');
        }
        const output = {
            success,
            mode: finalMode,
            stages,
            recommendations,
            timestamp: new Date().toISOString(),
        };
        if (options.json) {
            emitJson(output);
            if (!success) {
                process.exit(1);
            }
            return;
        }
        console.log(chalk.bold.cyan('\n🚀 Neurcode Bootstrap\n'));
        for (const stage of stages) {
            const icon = stage.status === 'success' ? '✅' : stage.status === 'skipped' ? '⏭️' : '❌';
            console.log(`${icon} ${stage.stage.replace(/_/g, ' ')}: ${stage.message}`);
        }
        if (recommendations.length > 0) {
            console.log(chalk.bold('\nNext:'));
            for (const item of recommendations) {
                console.log(chalk.dim(`  • ${item}`));
            }
        }
        console.log('');
        if (!success) {
            process.exit(1);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown bootstrap error';
        if (options.json) {
            emitJson({
                success: false,
                mode: strictGuard ? 'strict' : 'advisory',
                stages,
                recommendations: ['Inspect bootstrap runtime error and rerun.'],
                timestamp: new Date().toISOString(),
            });
        }
        else {
            console.error(chalk.red(`\n❌ Bootstrap failed: ${message}\n`));
        }
        process.exit(1);
    }
}
//# sourceMappingURL=bootstrap.js.map