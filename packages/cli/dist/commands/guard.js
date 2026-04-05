"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtimeGuardCommand = runtimeGuardCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const diff_parser_1 = require("@neurcode-ai/diff-parser");
const project_root_1 = require("../utils/project-root");
const state_1 = require("../utils/state");
const git_1 = require("../utils/git");
const runtime_guard_1 = require("../utils/runtime-guard");
const change_contract_1 = require("../utils/change-contract");
const policy_compiler_1 = require("../utils/policy-compiler");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        bold: (value) => value,
        cyan: (value) => value,
        dim: (value) => value,
        green: (value) => value,
        yellow: (value) => value,
        red: (value) => value,
    };
}
function normalizeRepoPath(value) {
    return value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
function emitJson(payload) {
    console.log(JSON.stringify(payload, null, 2));
}
function resolveDiffText(options) {
    if (options.staged) {
        return (0, git_1.execGitCommand)('git diff --cached');
    }
    if (options.head) {
        return (0, git_1.getDiffFromBase)('HEAD');
    }
    if (typeof options.base === 'string' && options.base.trim()) {
        return (0, git_1.getDiffFromBase)(options.base.trim());
    }
    return (0, git_1.getDiffFromBase)('HEAD~1');
}
function buildStartFailurePayload(errors) {
    return {
        success: false,
        message: `Runtime guard start failed: ${errors.join('; ')}`,
        errors,
    };
}
function evaluateSourceDrift(projectRoot, artifact) {
    const violations = [];
    if (artifact.source.changeContractPath) {
        const contractRead = (0, change_contract_1.readChangeContract)(projectRoot, artifact.source.changeContractPath);
        if (!contractRead.contract) {
            violations.push({
                code: 'RUNTIME_GUARD_CHANGE_CONTRACT_DRIFT',
                message: contractRead.error
                    ? `Runtime guard change contract invalid (${contractRead.error})`
                    : `Runtime guard change contract missing (${contractRead.path})`,
            });
        }
        else if (artifact.source.changeContractExpectedFilesFingerprint &&
            contractRead.contract.expectedFilesFingerprint !== artifact.source.changeContractExpectedFilesFingerprint) {
            violations.push({
                code: 'RUNTIME_GUARD_CHANGE_CONTRACT_DRIFT',
                message: `Runtime guard change contract drift detected (expected files fingerprint changed: ` +
                    `${artifact.source.changeContractExpectedFilesFingerprint} -> ${contractRead.contract.expectedFilesFingerprint})`,
            });
        }
    }
    if (artifact.source.compiledPolicyPath) {
        const compiledRead = (0, policy_compiler_1.readCompiledPolicyArtifact)(projectRoot, artifact.source.compiledPolicyPath);
        if (!compiledRead.artifact) {
            violations.push({
                code: 'RUNTIME_GUARD_COMPILED_POLICY_DRIFT',
                message: compiledRead.error
                    ? `Runtime guard compiled policy invalid (${compiledRead.error})`
                    : `Runtime guard compiled policy missing (${compiledRead.path})`,
            });
        }
        else if (artifact.source.compiledPolicyFingerprint &&
            compiledRead.artifact.fingerprint !== artifact.source.compiledPolicyFingerprint) {
            violations.push({
                code: 'RUNTIME_GUARD_COMPILED_POLICY_DRIFT',
                message: `Runtime guard compiled policy drift detected (fingerprint changed: ` +
                    `${artifact.source.compiledPolicyFingerprint} -> ${compiledRead.artifact.fingerprint})`,
            });
        }
    }
    return violations;
}
function printStatus(path, artifact) {
    console.log(chalk.bold.cyan('\n🧱 Runtime Guard Status\n'));
    console.log(chalk.dim(`Path: ${path}`));
    console.log(chalk.dim(`Guard ID: ${artifact.guardId}`));
    console.log(chalk.dim(`Mode: ${artifact.mode}`));
    console.log(chalk.dim(`Active: ${artifact.active ? 'yes' : 'no'}`));
    console.log(chalk.dim(`Created: ${artifact.createdAt}`));
    if (artifact.archivedAt) {
        console.log(chalk.dim(`Archived: ${artifact.archivedAt}`));
    }
    console.log(chalk.dim(`Plan ID: ${artifact.source.planId || '(none)'}`));
    console.log(chalk.dim(`Expected files: ${artifact.expectedFiles.length}`));
    console.log(chalk.dim(`Deterministic rules: ${artifact.deterministic.ruleCount}`));
    console.log(chalk.dim(`Unmatched statements: ${artifact.deterministic.unmatchedStatements.length}`));
    console.log(chalk.dim(`Checks run: ${artifact.stats.checksRun} (blocked ${artifact.stats.blockedChecks})`));
    if (artifact.stats.lastCheckedAt) {
        console.log(chalk.dim(`Last check: ${artifact.stats.lastCheckedAt}`));
    }
    console.log('');
}
function runtimeGuardCommand(program) {
    const guard = program
        .command('guard')
        .description('Pre-generation runtime guardrail enforcement for deterministic governance');
    guard
        .command('start')
        .description('Start runtime guard session from deterministic artifacts')
        .option('--plan-id <id>', 'Plan ID override for runtime guard scope')
        .option('--runtime-guard <path>', 'Runtime guard artifact path (default: .neurcode/runtime-guard.json)')
        .option('--change-contract <path>', 'Change contract path (default: .neurcode/change-contract.json)')
        .option('--compiled-policy <path>', 'Compiled policy path (default: neurcode.policy.compiled.json)')
        .option('--strict', 'Require change contract + compiled policy artifacts (default)', true)
        .option('--no-strict', 'Allow advisory runtime guard start without full deterministic artifacts')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const strict = options.strict !== false;
        const changeContractRead = (0, change_contract_1.readChangeContract)(projectRoot, options.changeContract);
        const compiledPolicyRead = (0, policy_compiler_1.readCompiledPolicyArtifact)(projectRoot, options.compiledPolicy);
        const planId = (typeof options.planId === 'string' && options.planId.trim() ? options.planId.trim() : null)
            || changeContractRead.contract?.planId
            || (0, state_1.getActivePlanId)();
        const errors = [];
        if (strict && !changeContractRead.contract) {
            errors.push(changeContractRead.error
                ? `change contract invalid (${changeContractRead.error})`
                : `change contract missing (${changeContractRead.path})`);
        }
        if (strict && !compiledPolicyRead.artifact) {
            errors.push(compiledPolicyRead.error
                ? `compiled policy invalid (${compiledPolicyRead.error})`
                : `compiled policy missing (${compiledPolicyRead.path})`);
        }
        if (planId &&
            changeContractRead.contract?.planId &&
            planId !== changeContractRead.contract.planId) {
            errors.push(`plan mismatch: requested ${planId}, change contract is ${changeContractRead.contract.planId}`);
        }
        const expectedFiles = changeContractRead.contract?.expectedFiles || [];
        if (strict && expectedFiles.length === 0) {
            errors.push('change contract has empty expected file scope');
        }
        if (strict && !planId) {
            errors.push('planId missing (pass --plan-id or generate/import a plan contract first)');
        }
        if (errors.length > 0) {
            if (options.json) {
                emitJson(buildStartFailurePayload(errors));
            }
            else {
                console.error(chalk.red('\n❌ Runtime guard start failed\n'));
                for (const entry of errors) {
                    console.error(chalk.red(`• ${entry}`));
                }
                console.error('');
            }
            process.exit(1);
        }
        const deterministicRules = compiledPolicyRead.artifact
            ? (0, policy_compiler_1.hydrateCompiledPolicyRules)(compiledPolicyRead.artifact)
            : [];
        const artifact = (0, runtime_guard_1.createRuntimeGuardArtifact)({
            mode: strict ? 'strict' : 'advisory',
            planId,
            sessionId: (0, state_1.getSessionId)(),
            projectId: (0, state_1.getProjectId)(),
            changeContractPath: changeContractRead.contract ? changeContractRead.path : null,
            changeContractId: changeContractRead.contract?.contractId || null,
            changeContractExpectedFilesFingerprint: changeContractRead.contract?.expectedFilesFingerprint || null,
            compiledPolicyPath: compiledPolicyRead.artifact ? compiledPolicyRead.path : null,
            compiledPolicyFingerprint: compiledPolicyRead.artifact?.fingerprint || null,
            expectedFiles,
            deterministicRules,
            unmatchedStatements: compiledPolicyRead.artifact?.compilation.unmatchedStatements || [],
        });
        const writtenPath = (0, runtime_guard_1.writeRuntimeGuardArtifact)(projectRoot, artifact, options.runtimeGuard);
        if (options.json) {
            emitJson({
                success: true,
                message: 'Runtime guard started.',
                path: writtenPath,
                guard: {
                    guardId: artifact.guardId,
                    mode: artifact.mode,
                    active: artifact.active,
                    planId: artifact.source.planId,
                    expectedFiles: artifact.expectedFiles.length,
                    deterministicRules: artifact.deterministic.ruleCount,
                    unmatchedStatements: artifact.deterministic.unmatchedStatements.length,
                },
            });
            return;
        }
        console.log(chalk.bold.cyan('\n🧱 Runtime Guard Started\n'));
        console.log(chalk.green(`Path: ${writtenPath}`));
        console.log(chalk.dim(`Guard ID: ${artifact.guardId}`));
        console.log(chalk.dim(`Mode: ${artifact.mode}`));
        console.log(chalk.dim(`Plan ID: ${artifact.source.planId || '(none)'}`));
        console.log(chalk.dim(`Expected files: ${artifact.expectedFiles.length}`));
        console.log(chalk.dim(`Deterministic rules: ${artifact.deterministic.ruleCount}`));
        if (artifact.deterministic.unmatchedStatements.length > 0) {
            console.log(chalk.yellow(`Unmatched deterministic statements: ${artifact.deterministic.unmatchedStatements.length}`));
        }
        console.log(chalk.dim('\nRun `neurcode guard check --staged` before commit to enforce runtime scope.\n'));
    });
    guard
        .command('check')
        .description('Check current diff against active runtime guard session')
        .option('--runtime-guard <path>', 'Runtime guard artifact path (default: .neurcode/runtime-guard.json)')
        .option('--staged', 'Check staged changes only')
        .option('--head', 'Check working tree against HEAD')
        .option('--base <ref>', 'Check working tree against specific git ref')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const guardRead = (0, runtime_guard_1.readRuntimeGuardArtifact)(projectRoot, options.runtimeGuard);
        if (!guardRead.artifact) {
            const message = guardRead.error
                ? `Runtime guard invalid (${guardRead.error})`
                : `Runtime guard not found (${guardRead.path})`;
            if (options.json) {
                emitJson({
                    success: false,
                    message,
                    path: guardRead.path,
                });
            }
            else {
                console.error(chalk.red(`\n❌ ${message}\n`));
            }
            process.exit(1);
        }
        const diffText = resolveDiffText(options);
        const parsed = (0, diff_parser_1.parseDiff)(diffText);
        const filtered = parsed.map((file) => ({
            ...file,
            path: normalizeRepoPath(file.path),
        }));
        const fileContents = {};
        for (const file of filtered) {
            const absolutePath = (0, path_1.resolve)(projectRoot, file.path);
            if ((0, fs_1.existsSync)(absolutePath)) {
                try {
                    fileContents[file.path] = (0, fs_1.readFileSync)(absolutePath, 'utf-8');
                }
                catch {
                    // Best-effort file content loading.
                }
            }
        }
        const baseEvaluation = (0, runtime_guard_1.evaluateRuntimeGuardArtifact)(guardRead.artifact, filtered, fileContents);
        const sourceDriftViolations = evaluateSourceDrift(projectRoot, guardRead.artifact);
        const violations = [...baseEvaluation.violations, ...sourceDriftViolations];
        const pass = violations.length === 0;
        const updatedArtifact = (0, runtime_guard_1.withRuntimeGuardCheckStats)(guardRead.artifact, {
            blocked: !pass,
        });
        (0, runtime_guard_1.writeRuntimeGuardArtifact)(projectRoot, updatedArtifact, options.runtimeGuard);
        if (options.json) {
            emitJson({
                success: pass,
                pass,
                guardId: updatedArtifact.guardId,
                mode: updatedArtifact.mode,
                path: guardRead.path,
                changedFiles: baseEvaluation.changedFiles,
                outOfScopeFiles: baseEvaluation.outOfScopeFiles,
                constraintViolations: baseEvaluation.constraintViolations,
                violations,
                adherenceScore: baseEvaluation.adherenceScore,
                plannedFilesModified: baseEvaluation.plannedFilesModified,
                totalPlannedFiles: baseEvaluation.totalPlannedFiles,
                stats: updatedArtifact.stats,
                message: pass
                    ? 'Runtime guard check passed.'
                    : `Runtime guard blocked ${violations.length} violation(s).`,
            });
        }
        else if (pass) {
            console.log(chalk.bold.cyan('\n🧱 Runtime Guard Check\n'));
            console.log(chalk.green('✅ Pass'));
            console.log(chalk.dim(`Changed files: ${baseEvaluation.changedFiles.length}`));
            console.log(chalk.dim(`Scope adherence: ${baseEvaluation.adherenceScore}%`));
            console.log('');
        }
        else {
            console.log(chalk.bold.cyan('\n🧱 Runtime Guard Check\n'));
            console.log(chalk.red(`⛔ Blocked (${violations.length} violation(s))`));
            for (const violation of violations) {
                const prefix = violation.file ? `${violation.file}: ` : '';
                console.log(chalk.red(`• [${violation.code}] ${prefix}${violation.message}`));
            }
            console.log('');
        }
        process.exit(pass ? 0 : 1);
    });
    guard
        .command('status')
        .description('Show runtime guard session status')
        .option('--runtime-guard <path>', 'Runtime guard artifact path (default: .neurcode/runtime-guard.json)')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const guardRead = (0, runtime_guard_1.readRuntimeGuardArtifact)(projectRoot, options.runtimeGuard);
        if (!guardRead.artifact) {
            const message = guardRead.error
                ? `Runtime guard invalid (${guardRead.error})`
                : `Runtime guard not found (${guardRead.path})`;
            if (options.json) {
                emitJson({
                    success: false,
                    path: guardRead.path,
                    message,
                });
            }
            else {
                console.error(chalk.red(`\n❌ ${message}\n`));
            }
            process.exit(1);
        }
        if (options.json) {
            emitJson({
                success: true,
                path: guardRead.path,
                guard: guardRead.artifact,
            });
            return;
        }
        printStatus(guardRead.path, guardRead.artifact);
    });
    guard
        .command('stop')
        .description('Stop the active runtime guard session')
        .option('--runtime-guard <path>', 'Runtime guard artifact path (default: .neurcode/runtime-guard.json)')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const guardRead = (0, runtime_guard_1.readRuntimeGuardArtifact)(projectRoot, options.runtimeGuard);
        if (!guardRead.artifact) {
            const message = guardRead.error
                ? `Runtime guard invalid (${guardRead.error})`
                : `Runtime guard not found (${guardRead.path})`;
            if (options.json) {
                emitJson({
                    success: false,
                    path: guardRead.path,
                    message,
                });
            }
            else {
                console.error(chalk.red(`\n❌ ${message}\n`));
            }
            process.exit(1);
        }
        const stopped = (0, runtime_guard_1.markRuntimeGuardStopped)(guardRead.artifact);
        const writtenPath = (0, runtime_guard_1.writeRuntimeGuardArtifact)(projectRoot, stopped, options.runtimeGuard);
        if (options.json) {
            emitJson({
                success: true,
                path: writtenPath,
                guardId: stopped.guardId,
                active: stopped.active,
                archivedAt: stopped.archivedAt,
                message: 'Runtime guard stopped.',
            });
            return;
        }
        console.log(chalk.bold.cyan('\n🧱 Runtime Guard Stopped\n'));
        console.log(chalk.green(`Path: ${writtenPath}`));
        console.log(chalk.dim(`Guard ID: ${stopped.guardId}`));
        if (stopped.archivedAt) {
            console.log(chalk.dim(`Archived at: ${stopped.archivedAt}`));
        }
        console.log('');
    });
}
//# sourceMappingURL=guard.js.map