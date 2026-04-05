"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.remediateCommand = remediateCommand;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const project_root_1 = require("../utils/project-root");
const core_1 = require("@neurcode-ai/core");
const analysis_1 = require("@neurcode-ai/analysis");
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
            // Keep searching.
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
function asNumber(record, key) {
    if (!record)
        return null;
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function asViolationsCount(record) {
    if (!record)
        return 0;
    const value = record.violations;
    if (!Array.isArray(value))
        return 0;
    return value.length;
}
async function runCliJson(commandArgs) {
    const args = commandArgs.includes('--json') ? [...commandArgs] : [...commandArgs, '--json'];
    const stdoutChunks = [];
    const stderrChunks = [];
    const exitCode = await new Promise((resolvePromise, reject) => {
        const child = (0, child_process_1.spawn)(process.execPath, [process.argv[1], ...args], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                CI: process.env.CI || 'true',
                FORCE_COLOR: '0',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
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
function resolveStrictArtifacts(options) {
    if (options.strictArtifacts === true)
        return true;
    if (options.strictArtifacts === false)
        return false;
    return process.env.NEURCODE_ENTERPRISE_MODE === '1' || process.env.CI === 'true';
}
function resolveEnforceChangeContract(options, strictArtifacts) {
    if (options.enforceChangeContract === true)
        return true;
    if (options.enforceChangeContract === false)
        return false;
    if (process.env.NEURCODE_VERIFY_ENFORCE_CHANGE_CONTRACT === '1')
        return true;
    return strictArtifacts;
}
function resolveRequireRuntimeGuard(options) {
    if (options.requireRuntimeGuard === true)
        return true;
    if (options.requireRuntimeGuard === false)
        return false;
    return process.env.NEURCODE_REMEDIATE_REQUIRE_RUNTIME_GUARD === '1';
}
function buildVerifyArgs(options, strictArtifacts, enforceChangeContract) {
    const args = ['verify'];
    if (options.planId)
        args.push('--plan-id', options.planId);
    if (options.projectId)
        args.push('--project-id', options.projectId);
    if (options.policyOnly)
        args.push('--policy-only');
    if (options.requirePlan)
        args.push('--require-plan');
    if (options.requirePolicyLock)
        args.push('--require-policy-lock');
    if (options.skipPolicyLock)
        args.push('--skip-policy-lock');
    if (strictArtifacts)
        args.push('--strict-artifacts');
    if (enforceChangeContract)
        args.push('--enforce-change-contract');
    if (options.noRecord !== true)
        args.push('--record');
    return args;
}
function buildShipArgs(options) {
    const maxFixAttempts = 1;
    const goal = options.goal?.trim() || 'Auto-remediate governance verification violations';
    const args = ['ship', goal, '--max-fix-attempts', String(maxFixAttempts), '--require-pass'];
    if (options.projectId)
        args.push('--project-id', options.projectId);
    if (options.skipTests !== false)
        args.push('--skip-tests');
    if (options.requirePolicyLock)
        args.push('--require-policy-lock');
    if (options.skipPolicyLock)
        args.push('--skip-policy-lock');
    if (options.noRecord === true)
        args.push('--no-record');
    if (options.publishCard === false)
        args.push('--no-publish-card');
    return args;
}
function isVerifyPass(snapshot) {
    return snapshot.exitCode === 0 && snapshot.verdict === 'PASS';
}
function toVerifySnapshot(result) {
    return {
        exitCode: result.exitCode,
        verdict: asString(result.payload, 'verdict'),
        score: asNumber(result.payload, 'score'),
        message: asString(result.payload, 'message'),
        violations: asViolationsCount(result.payload),
    };
}
function hasImproved(before, after) {
    if (isVerifyPass(after))
        return true;
    if (after.violations < before.violations)
        return true;
    if (typeof before.score === 'number'
        && typeof after.score === 'number'
        && Number.isFinite(before.score)
        && Number.isFinite(after.score)
        && after.score > before.score) {
        return true;
    }
    return false;
}
function resolveAutoRepairAiLog(options) {
    if (options.autoRepairAiLog === true)
        return true;
    if (options.autoRepairAiLog === false)
        return false;
    if (process.env.NEURCODE_REMEDIATE_AUTO_REPAIR_AI_LOG === '0')
        return false;
    return true;
}
function parseSigningKeyRing(raw) {
    if (!raw || !raw.trim()) {
        return {};
    }
    const out = {};
    for (const token of raw.split(/[,\n;]+/)) {
        const trimmed = token.trim();
        if (!trimmed)
            continue;
        const separator = trimmed.indexOf('=');
        if (separator <= 0)
            continue;
        const keyId = trimmed.slice(0, separator).trim();
        const key = trimmed.slice(separator + 1).trim();
        if (!keyId || !key)
            continue;
        out[keyId] = key;
    }
    return out;
}
function resolveAiLogSigningConfig() {
    const signingKeys = parseSigningKeyRing(process.env.NEURCODE_GOVERNANCE_SIGNING_KEYS);
    const envSigningKey = process.env.NEURCODE_GOVERNANCE_SIGNING_KEY?.trim()
        || process.env.NEURCODE_AI_LOG_SIGNING_KEY?.trim()
        || '';
    let signingKey = envSigningKey || null;
    let signingKeyId = process.env.NEURCODE_GOVERNANCE_SIGNING_KEY_ID?.trim() || null;
    if (!signingKey && Object.keys(signingKeys).length > 0) {
        if (signingKeyId && signingKeys[signingKeyId]) {
            signingKey = signingKeys[signingKeyId];
        }
        else {
            const fallbackKeyId = Object.keys(signingKeys).sort((a, b) => a.localeCompare(b))[0];
            signingKey = signingKeys[fallbackKeyId];
            signingKeyId = signingKeyId || fallbackKeyId;
        }
    }
    const signer = process.env.NEURCODE_GOVERNANCE_SIGNER?.trim()
        || process.env.USER
        || 'neurcode-cli';
    return {
        signingKey,
        signingKeyId,
        signer,
    };
}
function isAiChangeJustification(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const candidate = value;
    return (typeof candidate.task === 'string'
        && typeof candidate.generatedAt === 'string'
        && Array.isArray(candidate.changes));
}
function extractChangeJustificationFromLog(projectRoot) {
    const logPath = (0, core_1.resolveNeurcodeFile)(projectRoot, core_1.AI_CHANGE_LOG_FILENAME);
    const raw = (0, core_1.readJsonFile)(logPath, null);
    if (!raw)
        return null;
    if (isAiChangeJustification(raw)) {
        return raw;
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) {
        const envelope = raw;
        const nested = envelope.changeJustification;
        if (isAiChangeJustification(nested)) {
            return nested;
        }
    }
    return null;
}
function shouldAttemptAiLogRepair(verifyRun) {
    const payloadMessage = asString(verifyRun.payload, 'message') || '';
    const combined = `${payloadMessage}\n${verifyRun.stdout}\n${verifyRun.stderr}`.toLowerCase();
    if (combined.includes('ai change-log integrity check failed')) {
        return true;
    }
    const violations = verifyRun.payload?.violations;
    if (Array.isArray(violations)) {
        for (const entry of violations) {
            if (!entry || typeof entry !== 'object')
                continue;
            const rule = entry.rule;
            if (typeof rule === 'string' && rule.toLowerCase().includes('ai_change_log_integrity')) {
                return true;
            }
        }
    }
    return false;
}
function attemptAiLogIntegrityRepair(projectRoot) {
    const payload = extractChangeJustificationFromLog(projectRoot);
    if (!payload) {
        return {
            attempted: true,
            repaired: false,
            backupPath: null,
            message: 'No valid AI change-log payload found to repair.',
        };
    }
    const auditPath = (0, core_1.resolveNeurcodeFile)(projectRoot, core_1.AI_CHANGE_LOG_AUDIT_FILENAME);
    let backupPath = null;
    try {
        if ((0, fs_1.existsSync)(auditPath)) {
            backupPath = `${auditPath}.backup.${Date.now()}`;
            (0, fs_1.copyFileSync)(auditPath, backupPath);
            (0, fs_1.unlinkSync)(auditPath);
        }
    }
    catch (error) {
        return {
            attempted: true,
            repaired: false,
            backupPath,
            message: `Failed to prepare AI log audit repair: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
    try {
        const signing = resolveAiLogSigningConfig();
        (0, analysis_1.writeAiChangeLogWithIntegrity)(projectRoot, payload, {
            signingKey: signing.signingKey,
            keyId: signing.signingKeyId,
            signer: signing.signer,
        });
        return {
            attempted: true,
            repaired: true,
            backupPath,
            message: backupPath
                ? `AI change-log integrity repaired (audit backup: ${backupPath}).`
                : 'AI change-log integrity repaired.',
        };
    }
    catch (error) {
        return {
            attempted: true,
            repaired: false,
            backupPath,
            message: `AI change-log repair failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}
async function remediateCommand(options = {}) {
    const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const strictArtifacts = resolveStrictArtifacts(options);
    const enforceChangeContract = resolveEnforceChangeContract(options, strictArtifacts);
    const requireRuntimeGuard = resolveRequireRuntimeGuard(options);
    const autoRepairAiLog = resolveAutoRepairAiLog(options);
    const maxAttempts = Number.isFinite(options.maxFixAttempts) && Number(options.maxFixAttempts) >= 0
        ? Math.floor(Number(options.maxFixAttempts))
        : 2;
    try {
        let baselineVerifyRun = await runCliJson(buildVerifyArgs(options, strictArtifacts, enforceChangeContract));
        let currentSnapshot = toVerifySnapshot(baselineVerifyRun);
        let aiLogRepair = {
            attempted: false,
            repaired: false,
            backupPath: null,
            message: null,
        };
        if (autoRepairAiLog && !isVerifyPass(currentSnapshot) && shouldAttemptAiLogRepair(baselineVerifyRun)) {
            aiLogRepair = attemptAiLogIntegrityRepair(projectRoot);
            if (aiLogRepair.repaired) {
                baselineVerifyRun = await runCliJson(buildVerifyArgs(options, strictArtifacts, enforceChangeContract));
                currentSnapshot = toVerifySnapshot(baselineVerifyRun);
            }
        }
        const attempts = [];
        let stopReason = 'verify_passed_without_remediation';
        if (isVerifyPass(currentSnapshot)) {
            const output = {
                success: true,
                remediated: false,
                preflight: {
                    aiLogRepair,
                },
                strictMode: {
                    strictArtifacts,
                    enforceChangeContract,
                    requireRuntimeGuard,
                },
                baseline: currentSnapshot,
                attempts,
                finalVerify: currentSnapshot,
                stopReason,
                message: 'Verify already passed. No remediation required.',
                timestamp: new Date().toISOString(),
            };
            if (options.json) {
                emitJson(output);
            }
            else {
                console.log(chalk.bold.cyan('\n🛠️  Neurcode Remediate\n'));
                if (aiLogRepair.attempted) {
                    console.log(aiLogRepair.repaired
                        ? chalk.green(`✅ ${aiLogRepair.message || 'AI change-log integrity repaired.'}`)
                        : chalk.yellow(`⚠️  ${aiLogRepair.message || 'AI change-log integrity repair was attempted but did not complete.'}`));
                }
                console.log(chalk.green('✅ Verify already PASS. No remediation required.'));
            }
            return;
        }
        if (maxAttempts === 0) {
            stopReason = 'max_attempts_zero';
            const output = {
                success: false,
                remediated: false,
                preflight: {
                    aiLogRepair,
                },
                strictMode: {
                    strictArtifacts,
                    enforceChangeContract,
                    requireRuntimeGuard,
                },
                baseline: currentSnapshot,
                attempts,
                finalVerify: currentSnapshot,
                stopReason,
                message: 'Remediation attempts disabled (--max-fix-attempts 0).',
                timestamp: new Date().toISOString(),
            };
            if (options.json) {
                emitJson(output);
            }
            else {
                console.log(chalk.bold.cyan('\n🛠️  Neurcode Remediate\n'));
                console.log(chalk.red('❌ Remediation attempts disabled and verify is not PASS.'));
            }
            process.exit(1);
        }
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const attemptSummary = {
                attempt,
                before: currentSnapshot,
                runtimeGuard: {
                    executed: false,
                    pass: null,
                    message: null,
                },
                ship: {
                    executed: false,
                    exitCode: null,
                    status: null,
                    finalPlanId: null,
                },
                after: null,
                improved: null,
                delta: {
                    score: null,
                    violations: null,
                },
                stopReason: null,
            };
            if (requireRuntimeGuard) {
                attemptSummary.runtimeGuard.executed = true;
                const guardRun = await runCliJson(['guard', 'check', '--head']);
                const guardPass = guardRun.exitCode === 0;
                attemptSummary.runtimeGuard.pass = guardPass;
                attemptSummary.runtimeGuard.message =
                    asString(guardRun.payload, 'message')
                        || (guardPass ? 'Runtime guard check passed.' : 'Runtime guard check failed.');
                if (!guardPass) {
                    attemptSummary.stopReason = 'runtime_guard_blocked';
                    attempts.push(attemptSummary);
                    stopReason = 'runtime_guard_blocked';
                    break;
                }
            }
            const shipRun = await runCliJson(buildShipArgs(options));
            attemptSummary.ship.executed = true;
            attemptSummary.ship.exitCode = shipRun.exitCode;
            attemptSummary.ship.status = asString(shipRun.payload, 'status');
            attemptSummary.ship.finalPlanId = asString(shipRun.payload, 'finalPlanId');
            const afterVerifyRun = await runCliJson(buildVerifyArgs(options, strictArtifacts, enforceChangeContract));
            const afterSnapshot = toVerifySnapshot(afterVerifyRun);
            attemptSummary.after = afterSnapshot;
            attemptSummary.delta = {
                score: typeof currentSnapshot.score === 'number' && typeof afterSnapshot.score === 'number'
                    ? afterSnapshot.score - currentSnapshot.score
                    : null,
                violations: afterSnapshot.violations - currentSnapshot.violations,
            };
            attemptSummary.improved = hasImproved(currentSnapshot, afterSnapshot);
            attempts.push(attemptSummary);
            currentSnapshot = afterSnapshot;
            if (isVerifyPass(afterSnapshot)) {
                stopReason = 'verify_passed_after_remediation';
                break;
            }
            if (!attemptSummary.improved) {
                attemptSummary.stopReason = 'no_progress';
                stopReason = 'no_progress';
                break;
            }
            if (attempt === maxAttempts) {
                stopReason = 'max_attempts_exhausted';
            }
        }
        const success = isVerifyPass(currentSnapshot);
        const output = {
            success,
            remediated: attempts.length > 0,
            preflight: {
                aiLogRepair,
            },
            strictMode: {
                strictArtifacts,
                enforceChangeContract,
                requireRuntimeGuard,
            },
            baseline: toVerifySnapshot(baselineVerifyRun),
            attempts,
            finalVerify: currentSnapshot,
            stopReason,
            message: success
                ? 'Auto-remediation completed and verify now passes.'
                : 'Auto-remediation finished but verify is still not PASS.',
            timestamp: new Date().toISOString(),
        };
        if (options.json) {
            emitJson(output);
            process.exit(success ? 0 : 1);
        }
        console.log(chalk.bold.cyan('\n🛠️  Neurcode Remediate\n'));
        if (output.preflight.aiLogRepair.attempted) {
            console.log(output.preflight.aiLogRepair.repaired
                ? chalk.green(`✅ ${output.preflight.aiLogRepair.message || 'AI change-log integrity repaired before remediation.'}`)
                : chalk.yellow(`⚠️  ${output.preflight.aiLogRepair.message || 'AI change-log integrity repair was attempted but did not complete.'}`));
            if (output.preflight.aiLogRepair.backupPath) {
                console.log(chalk.dim(`   Audit backup: ${output.preflight.aiLogRepair.backupPath}`));
            }
        }
        console.log(chalk.dim(`Baseline verify: ${output.baseline.verdict || 'UNKNOWN'}`
            + `${output.baseline.score != null ? ` (score ${output.baseline.score})` : ''}`
            + `, violations: ${output.baseline.violations}`));
        console.log(chalk.dim(`Strict mode: artifacts=${strictArtifacts ? 'on' : 'off'}, `
            + `change-contract=${enforceChangeContract ? 'on' : 'off'}, `
            + `runtime-guard=${requireRuntimeGuard ? 'required' : 'optional'}`));
        for (const attempt of output.attempts) {
            const after = attempt.after;
            const afterLabel = after
                ? `${after.verdict || 'UNKNOWN'}${after.score != null ? ` (score ${after.score})` : ''}, violations: ${after.violations}`
                : 'n/a';
            console.log(chalk.dim(`Attempt ${attempt.attempt}: ship=${attempt.ship.status || 'UNKNOWN'}, verify=${afterLabel}`));
            if (attempt.runtimeGuard.executed) {
                console.log(chalk.dim(`  runtime guard: ${attempt.runtimeGuard.pass ? 'pass' : 'block'}`
                    + `${attempt.runtimeGuard.message ? ` (${attempt.runtimeGuard.message})` : ''}`));
            }
            if (attempt.improved === false) {
                console.log(chalk.yellow('  no measurable governance improvement; stopping remediation loop'));
            }
        }
        console.log(success
            ? chalk.green(`✅ Final verify PASS${output.finalVerify.score != null ? ` (score ${output.finalVerify.score})` : ''}`)
            : chalk.red(`❌ Final verify ${output.finalVerify.verdict || 'UNKNOWN'}`
                + `${output.finalVerify.score != null ? ` (score ${output.finalVerify.score})` : ''}`
                + `, violations: ${output.finalVerify.violations}`));
        console.log(chalk.dim(`Stop reason: ${output.stopReason}`));
        console.log(chalk.dim(output.message));
        if (!success) {
            process.exit(1);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (options.json) {
            emitJson({
                success: false,
                remediated: false,
                preflight: {
                    aiLogRepair: {
                        attempted: false,
                        repaired: false,
                        backupPath: null,
                        message: null,
                    },
                },
                strictMode: {
                    strictArtifacts,
                    enforceChangeContract,
                    requireRuntimeGuard,
                },
                baseline: {
                    exitCode: 1,
                    verdict: null,
                    score: null,
                    message: null,
                    violations: 0,
                },
                attempts: [],
                finalVerify: {
                    exitCode: 1,
                    verdict: null,
                    score: null,
                    message: null,
                    violations: 0,
                },
                stopReason: 'runtime_error',
                message,
                timestamp: new Date().toISOString(),
            });
            process.exit(1);
        }
        console.error(chalk.red(`\n❌ Remediation failed: ${message}\n`));
        process.exit(1);
    }
}
//# sourceMappingURL=remediate.js.map