"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.remediateCommand = remediateCommand;
const child_process_1 = require("child_process");
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
async function remediateCommand(options = {}) {
    const strictArtifacts = resolveStrictArtifacts(options);
    const enforceChangeContract = resolveEnforceChangeContract(options, strictArtifacts);
    const requireRuntimeGuard = resolveRequireRuntimeGuard(options);
    const maxAttempts = Number.isFinite(options.maxFixAttempts) && Number(options.maxFixAttempts) >= 0
        ? Math.floor(Number(options.maxFixAttempts))
        : 2;
    try {
        const baselineVerifyRun = await runCliJson(buildVerifyArgs(options, strictArtifacts, enforceChangeContract));
        let currentSnapshot = toVerifySnapshot(baselineVerifyRun);
        const attempts = [];
        let stopReason = 'verify_passed_without_remediation';
        if (isVerifyPass(currentSnapshot)) {
            const output = {
                success: true,
                remediated: false,
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
                console.log(chalk.green('✅ Verify already PASS. No remediation required.'));
            }
            return;
        }
        if (maxAttempts === 0) {
            stopReason = 'max_attempts_zero';
            const output = {
                success: false,
                remediated: false,
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