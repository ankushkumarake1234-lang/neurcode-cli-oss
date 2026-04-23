"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shipCommand = shipCommand;
exports.shipResumeCommand = shipResumeCommand;
exports.shipRunsCommand = shipRunsCommand;
exports.shipAttestationVerifyCommand = shipAttestationVerifyCommand;
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const api_client_1 = require("../api-client");
const config_1 = require("../config");
const project_root_1 = require("../utils/project-root");
const state_1 = require("../utils/state");
const breakage_simulator_1 = require("../utils/breakage-simulator");
const manual_approvals_1 = require("../utils/manual-approvals");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (str) => str,
        yellow: (str) => str,
        red: (str) => str,
        bold: (str) => str,
        dim: (str) => str,
        cyan: (str) => str,
        white: (str) => str,
    };
}
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
const PLAN_ID_PATTERN = /Plan ID:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
const WRITE_PATH_PATTERN = /✅\s+Written:\s+(.+)$/gm;
function getShipRunDir(cwd) {
    return (0, path_1.join)(cwd, '.neurcode', 'ship', 'runs');
}
function getShipRunPath(cwd, runId) {
    return (0, path_1.join)(getShipRunDir(cwd), `${runId}.json`);
}
function saveShipCheckpoint(cwd, checkpoint) {
    const dir = getShipRunDir(cwd);
    if (!(0, fs_1.existsSync)(dir)) {
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    }
    (0, fs_1.writeFileSync)(getShipRunPath(cwd, checkpoint.runId), JSON.stringify(checkpoint, null, 2) + '\n', 'utf-8');
}
function loadShipCheckpoint(cwd, runId) {
    const path = getShipRunPath(cwd, runId);
    if (!(0, fs_1.existsSync)(path))
        return null;
    try {
        const parsed = JSON.parse((0, fs_1.readFileSync)(path, 'utf-8'));
        if (parsed &&
            parsed.version === 1 &&
            typeof parsed.runId === 'string' &&
            typeof parsed.goal === 'string' &&
            typeof parsed.cwd === 'string') {
            return parsed;
        }
    }
    catch {
        // Invalid checkpoint payload.
    }
    return null;
}
function listShipRunSummaries(cwd) {
    const dir = getShipRunDir(cwd);
    if (!(0, fs_1.existsSync)(dir))
        return [];
    const summaries = [];
    for (const entry of (0, fs_1.readdirSync)(dir)) {
        if (!entry.endsWith('.json'))
            continue;
        const runId = entry.replace(/\.json$/, '');
        const checkpoint = loadShipCheckpoint(cwd, runId);
        if (!checkpoint)
            continue;
        summaries.push({
            runId: checkpoint.runId,
            status: checkpoint.status,
            stage: checkpoint.stage,
            goal: checkpoint.goal,
            updatedAt: checkpoint.updatedAt,
            currentPlanId: checkpoint.currentPlanId,
            resultStatus: checkpoint.resultStatus,
        });
    }
    summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return summaries;
}
function createShipCheckpoint(input) {
    return {
        version: 1,
        runId: input.runId,
        goal: input.goal,
        cwd: input.cwd,
        status: 'running',
        stage: 'bootstrap',
        startedAt: input.startedAt,
        updatedAt: new Date().toISOString(),
        options: {
            projectId: input.options.projectId || null,
            maxFixAttempts: input.maxFixAttempts,
            allowDirty: input.options.allowDirty === true,
            skipTests: input.options.skipTests === true,
            testCommand: input.options.testCommand || null,
            record: input.options.record !== false,
            requirePass: input.requirePass,
            requirePolicyLock: input.requirePolicyLock,
            skipPolicyLock: input.skipPolicyLock,
            manualApproveHighRisk: input.options.manualApproveHighRisk === true,
            publishCard: input.options.publishCard !== false,
        },
        baselineDirtyPaths: [],
        initialPlanId: null,
        currentPlanId: null,
        repairPlanIds: [],
        remediationAttemptsUsed: 0,
        verifyExitCode: null,
        verifyPayload: null,
        tests: {
            skipped: input.options.skipTests === true,
            passed: input.options.skipTests === true,
            exitCode: input.options.skipTests === true ? 0 : null,
            attempts: 0,
            command: input.options.testCommand || null,
        },
        resultStatus: null,
        artifacts: null,
        shareCard: null,
        audit: null,
        error: null,
    };
}
function stripAnsi(value) {
    return value.replace(ANSI_PATTERN, '');
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function parsePositiveInt(raw) {
    if (!raw)
        return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return null;
    return Math.floor(parsed);
}
function resolveTimeoutMs(raw, fallbackMs) {
    const parsed = parsePositiveInt(raw);
    const candidate = parsed ?? fallbackMs;
    return clamp(candidate, 30_000, 60 * 60 * 1000);
}
function resolveHeartbeatMs(raw, fallbackMs) {
    const parsed = parsePositiveInt(raw);
    const candidate = parsed ?? fallbackMs;
    return clamp(candidate, 5_000, 120_000);
}
function getPlanTimeoutMs() {
    return resolveTimeoutMs(process.env.NEURCODE_SHIP_PLAN_TIMEOUT_MS, resolveTimeoutMs(process.env.NEURCODE_SHIP_STEP_TIMEOUT_MS, 8 * 60 * 1000));
}
function getApplyTimeoutMs() {
    return resolveTimeoutMs(process.env.NEURCODE_SHIP_APPLY_TIMEOUT_MS, resolveTimeoutMs(process.env.NEURCODE_SHIP_STEP_TIMEOUT_MS, 15 * 60 * 1000));
}
function getVerifyTimeoutMs() {
    return resolveTimeoutMs(process.env.NEURCODE_SHIP_VERIFY_TIMEOUT_MS, resolveTimeoutMs(process.env.NEURCODE_SHIP_STEP_TIMEOUT_MS, 6 * 60 * 1000));
}
function getTestTimeoutMs() {
    return resolveTimeoutMs(process.env.NEURCODE_SHIP_TEST_TIMEOUT_MS, resolveTimeoutMs(process.env.NEURCODE_SHIP_STEP_TIMEOUT_MS, 20 * 60 * 1000));
}
function getHeartbeatIntervalMs() {
    return resolveHeartbeatMs(process.env.NEURCODE_SHIP_HEARTBEAT_MS, 30_000);
}
function shellTailLines(text, limit) {
    return text
        .split('\n')
        .filter(Boolean)
        .slice(-limit)
        .join('\n');
}
function emitShipJson(payload) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}
function inferStepStatus(run) {
    if (!run)
        return 'SKIPPED';
    const stderr = (run.stderr || '').toLowerCase();
    if (run.code === 124 || stderr.includes('exceeded timeout')) {
        return 'TIMEOUT';
    }
    return run.code === 0 ? 'SUCCESS' : 'FAILED';
}
function recordRunStep(steps, input) {
    const nowIso = new Date().toISOString();
    const run = input.run;
    const durationMs = run?.durationMs ?? 0;
    const startedAt = input.startedAt
        ? input.startedAt
        : new Date(Date.now() - Math.max(0, durationMs)).toISOString();
    steps.push({
        stage: input.stage,
        attempt: input.attempt,
        status: inferStepStatus(run),
        startedAt,
        endedAt: nowIso,
        durationMs,
        ...(run ? { exitCode: run.code } : {}),
        ...(input.planId ? { planId: input.planId } : {}),
        ...(input.message ? { message: input.message } : {}),
    });
}
function getCliEntryPath() {
    return (0, path_1.resolve)(__dirname, '..', 'index.js');
}
function runCliCommand(cwd, args, extraEnv, execution) {
    return new Promise((resolvePromise) => {
        const startedAt = Date.now();
        const timeoutMs = execution?.timeoutMs ?? getPlanTimeoutMs();
        const heartbeatMs = execution?.heartbeatMs ?? getHeartbeatIntervalMs();
        const commandLabel = execution?.label || `neurcode ${args.join(' ')}`;
        const streamOutput = execution?.streamOutput !== false;
        const child = (0, child_process_1.spawn)(process.execPath, [getCliEntryPath(), ...args], {
            cwd,
            env: {
                ...process.env,
                CI: 'true',
                ...(extraEnv || {}),
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        let timedOut = false;
        let timeoutHandle = null;
        let heartbeatHandle = null;
        let forceKillHandle = null;
        const finalize = (code) => {
            if (settled)
                return;
            settled = true;
            if (timeoutHandle)
                clearTimeout(timeoutHandle);
            if (heartbeatHandle)
                clearInterval(heartbeatHandle);
            if (forceKillHandle)
                clearTimeout(forceKillHandle);
            resolvePromise({
                code,
                stdout,
                stderr,
                durationMs: Date.now() - startedAt,
            });
        };
        timeoutHandle = setTimeout(() => {
            timedOut = true;
            const timeoutMessage = `⏱️  ${commandLabel} exceeded timeout (${Math.round(timeoutMs / 1000)}s). Terminating.`;
            stderr += `${timeoutMessage}\n`;
            console.error(chalk.red(timeoutMessage));
            try {
                child.kill('SIGTERM');
            }
            catch {
                // Ignore process termination errors.
            }
            forceKillHandle = setTimeout(() => {
                try {
                    child.kill('SIGKILL');
                }
                catch {
                    // Ignore process termination errors.
                }
            }, 5_000);
            if (typeof forceKillHandle.unref === 'function') {
                forceKillHandle.unref();
            }
        }, timeoutMs);
        if (typeof timeoutHandle.unref === 'function') {
            timeoutHandle.unref();
        }
        heartbeatHandle = setInterval(() => {
            const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
            console.log(chalk.dim(`⏳ ${commandLabel} still running (${elapsedSeconds}s elapsed)...`));
        }, heartbeatMs);
        if (typeof heartbeatHandle.unref === 'function') {
            heartbeatHandle.unref();
        }
        child.stdout.on('data', (chunk) => {
            const text = chunk.toString();
            stdout += text;
            if (streamOutput) {
                process.stdout.write(text);
            }
        });
        child.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            stderr += text;
            if (streamOutput) {
                process.stderr.write(text);
            }
        });
        child.on('error', (error) => {
            stderr += `${error instanceof Error ? error.message : String(error)}\n`;
            finalize(1);
        });
        child.on('close', (code) => {
            if (timedOut) {
                finalize(124);
                return;
            }
            finalize(code ?? 1);
        });
    });
}
function runShellCommand(cwd, command, execution) {
    return new Promise((resolvePromise) => {
        const startedAt = Date.now();
        const timeoutMs = execution?.timeoutMs ?? getTestTimeoutMs();
        const heartbeatMs = execution?.heartbeatMs ?? getHeartbeatIntervalMs();
        const commandLabel = execution?.label || command;
        const streamOutput = execution?.streamOutput !== false;
        const child = (0, child_process_1.spawn)(command, {
            cwd,
            env: {
                ...process.env,
            },
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        let timedOut = false;
        let timeoutHandle = null;
        let heartbeatHandle = null;
        let forceKillHandle = null;
        const finalize = (code) => {
            if (settled)
                return;
            settled = true;
            if (timeoutHandle)
                clearTimeout(timeoutHandle);
            if (heartbeatHandle)
                clearInterval(heartbeatHandle);
            if (forceKillHandle)
                clearTimeout(forceKillHandle);
            resolvePromise({
                code,
                stdout,
                stderr,
                durationMs: Date.now() - startedAt,
            });
        };
        timeoutHandle = setTimeout(() => {
            timedOut = true;
            const timeoutMessage = `⏱️  ${commandLabel} exceeded timeout (${Math.round(timeoutMs / 1000)}s). Terminating.`;
            stderr += `${timeoutMessage}\n`;
            console.error(chalk.red(timeoutMessage));
            try {
                child.kill('SIGTERM');
            }
            catch {
                // Ignore process termination errors.
            }
            forceKillHandle = setTimeout(() => {
                try {
                    child.kill('SIGKILL');
                }
                catch {
                    // Ignore process termination errors.
                }
            }, 5_000);
            if (typeof forceKillHandle.unref === 'function') {
                forceKillHandle.unref();
            }
        }, timeoutMs);
        if (typeof timeoutHandle.unref === 'function') {
            timeoutHandle.unref();
        }
        heartbeatHandle = setInterval(() => {
            const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
            console.log(chalk.dim(`⏳ ${commandLabel} still running (${elapsedSeconds}s elapsed)...`));
        }, heartbeatMs);
        if (typeof heartbeatHandle.unref === 'function') {
            heartbeatHandle.unref();
        }
        child.stdout.on('data', (chunk) => {
            const text = chunk.toString();
            stdout += text;
            if (streamOutput) {
                process.stdout.write(text);
            }
        });
        child.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            stderr += text;
            if (streamOutput) {
                process.stderr.write(text);
            }
        });
        child.on('error', (error) => {
            stderr += `${error instanceof Error ? error.message : String(error)}\n`;
            finalize(1);
        });
        child.on('close', (code) => {
            if (timedOut) {
                finalize(124);
                return;
            }
            finalize(code ?? 1);
        });
    });
}
function extractPlanId(output) {
    const clean = stripAnsi(output);
    let latest = null;
    let match;
    while ((match = PLAN_ID_PATTERN.exec(clean)) !== null) {
        latest = match[1];
    }
    return latest;
}
function extractLastJsonObject(output) {
    const clean = stripAnsi(output).trim();
    if (!clean)
        return null;
    // Fast path for strict JSON mode outputs (single payload, no human preamble).
    try {
        return JSON.parse(clean);
    }
    catch {
        // Fall through to mixed-output recovery.
    }
    const firstBrace = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (firstBrace >= 0 && end > firstBrace) {
        const envelope = clean.slice(firstBrace, end + 1).trim();
        try {
            return JSON.parse(envelope);
        }
        catch {
            // Continue with fallback scanning.
        }
    }
    // Fallback: recover the longest parseable object near the tail.
    let bestMatch = null;
    let bestLen = -1;
    const safeEnd = end >= 0 ? end : clean.length - 1;
    let start = clean.lastIndexOf('{', safeEnd);
    while (start >= 0) {
        const candidate = clean.slice(start, safeEnd + 1).trim();
        try {
            const parsed = JSON.parse(candidate);
            if (candidate.length > bestLen) {
                bestLen = candidate.length;
                bestMatch = parsed;
            }
        }
        catch {
            // Ignore parse failures and continue searching.
        }
        start = clean.lastIndexOf('{', start - 1);
    }
    return bestMatch;
}
function parseVerifyPayload(output) {
    const parsed = extractLastJsonObject(output);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return null;
    const record = parsed;
    if (typeof record.verdict !== 'string' || typeof record.grade !== 'string') {
        return null;
    }
    const rawViolations = Array.isArray(record.violations) ? record.violations : [];
    const violations = rawViolations
        .filter((item) => !!item && typeof item === 'object')
        .map((item) => ({
        file: typeof item.file === 'string' ? item.file : 'unknown',
        rule: typeof item.rule === 'string' ? item.rule : 'unknown',
        severity: typeof item.severity === 'string' ? item.severity : 'warn',
        message: typeof item.message === 'string' ? item.message : undefined,
        startLine: typeof item.startLine === 'number' ? item.startLine : undefined,
    }));
    const policyLock = record.policyLock && typeof record.policyLock === 'object' && !Array.isArray(record.policyLock)
        ? (() => {
            const raw = record.policyLock;
            const mismatches = Array.isArray(raw.mismatches)
                ? raw.mismatches
                    .filter((item) => !!item && typeof item === 'object')
                    .map((item) => ({
                    code: typeof item.code === 'string' ? item.code : 'UNKNOWN',
                    message: typeof item.message === 'string' ? item.message : '',
                    expected: typeof item.expected === 'string' ? item.expected : undefined,
                    actual: typeof item.actual === 'string' ? item.actual : undefined,
                }))
                : [];
            return {
                enforced: raw.enforced === true,
                matched: raw.matched !== false,
                path: typeof raw.path === 'string' ? raw.path : '',
                mismatches,
            };
        })()
        : undefined;
    const policyExceptions = record.policyExceptions && typeof record.policyExceptions === 'object' && !Array.isArray(record.policyExceptions)
        ? (() => {
            const raw = record.policyExceptions;
            const matchedExceptionIds = Array.isArray(raw.matchedExceptionIds)
                ? raw.matchedExceptionIds.filter((item) => typeof item === 'string')
                : [];
            const suppressedViolations = Array.isArray(raw.suppressedViolations)
                ? raw.suppressedViolations
                    .filter((item) => !!item && typeof item === 'object')
                    .map((item) => ({
                    file: typeof item.file === 'string' ? item.file : 'unknown',
                    rule: typeof item.rule === 'string' ? item.rule : 'unknown',
                    severity: typeof item.severity === 'string' ? item.severity : 'warn',
                    message: typeof item.message === 'string' ? item.message : undefined,
                    exceptionId: typeof item.exceptionId === 'string' ? item.exceptionId : 'unknown',
                    reason: typeof item.reason === 'string' ? item.reason : '',
                    expiresAt: typeof item.expiresAt === 'string' ? item.expiresAt : '',
                    startLine: typeof item.startLine === 'number' ? item.startLine : undefined,
                }))
                : [];
            return {
                configured: typeof raw.configured === 'number' ? raw.configured : 0,
                active: typeof raw.active === 'number' ? raw.active : 0,
                usable: typeof raw.usable === 'number' ? raw.usable : undefined,
                matched: typeof raw.matched === 'number' ? raw.matched : matchedExceptionIds.length,
                suppressed: typeof raw.suppressed === 'number' ? raw.suppressed : suppressedViolations.length,
                blocked: typeof raw.blocked === 'number' ? raw.blocked : undefined,
                matchedExceptionIds,
                suppressedViolations,
                blockedViolations: Array.isArray(raw.blockedViolations)
                    ? raw.blockedViolations
                        .filter((item) => !!item && typeof item === 'object')
                        .map((item) => ({
                        file: typeof item.file === 'string' ? item.file : 'unknown',
                        rule: typeof item.rule === 'string' ? item.rule : 'unknown',
                        severity: typeof item.severity === 'string' ? item.severity : 'warn',
                        message: typeof item.message === 'string' ? item.message : undefined,
                        startLine: typeof item.startLine === 'number' ? item.startLine : undefined,
                    }))
                    : undefined,
            };
        })()
        : undefined;
    const policyGovernance = record.policyGovernance && typeof record.policyGovernance === 'object' && !Array.isArray(record.policyGovernance)
        ? (() => {
            const raw = record.policyGovernance;
            const approvalsRaw = raw.exceptionApprovals && typeof raw.exceptionApprovals === 'object' && !Array.isArray(raw.exceptionApprovals)
                ? raw.exceptionApprovals
                : null;
            const auditRaw = raw.audit && typeof raw.audit === 'object' && !Array.isArray(raw.audit)
                ? raw.audit
                : null;
            return {
                exceptionApprovals: approvalsRaw
                    ? {
                        required: approvalsRaw.required === true,
                        minApprovals: typeof approvalsRaw.minApprovals === 'number' ? approvalsRaw.minApprovals : 1,
                        disallowSelfApproval: approvalsRaw.disallowSelfApproval !== false,
                        allowedApprovers: Array.isArray(approvalsRaw.allowedApprovers)
                            ? approvalsRaw.allowedApprovers.filter((item) => typeof item === 'string')
                            : [],
                    }
                    : undefined,
                audit: auditRaw
                    ? {
                        requireIntegrity: auditRaw.requireIntegrity === true,
                        valid: auditRaw.valid !== false,
                        issues: Array.isArray(auditRaw.issues)
                            ? auditRaw.issues.filter((item) => typeof item === 'string')
                            : [],
                        lastHash: typeof auditRaw.lastHash === 'string' ? auditRaw.lastHash : null,
                        eventCount: typeof auditRaw.eventCount === 'number' ? auditRaw.eventCount : 0,
                    }
                    : undefined,
            };
        })()
        : undefined;
    const contextPolicy = record.contextPolicy && typeof record.contextPolicy === 'object' && !Array.isArray(record.contextPolicy)
        ? (() => {
            const raw = record.contextPolicy;
            const violations = Array.isArray(raw.violations)
                ? raw.violations
                    .filter((item) => !!item && typeof item === 'object')
                    .map((item) => ({
                    file: typeof item.file === 'string' ? item.file : 'unknown',
                    rule: typeof item.rule === 'string' ? item.rule : 'unknown',
                    reason: typeof item.reason === 'string' ? item.reason : '',
                }))
                : [];
            return {
                deniedModifyTouched: Array.isArray(raw.deniedModifyTouched)
                    ? raw.deniedModifyTouched.filter((item) => typeof item === 'string')
                    : [],
                violations,
            };
        })()
        : undefined;
    const blastRadius = record.blastRadius && typeof record.blastRadius === 'object' && !Array.isArray(record.blastRadius)
        ? (() => {
            const raw = record.blastRadius;
            const risk = typeof raw.riskScore === 'string' ? raw.riskScore.toLowerCase() : 'low';
            const riskScore = risk === 'high' || risk === 'medium' ? risk : 'low';
            return {
                filesChanged: typeof raw.filesChanged === 'number' ? raw.filesChanged : 0,
                functionsAffected: typeof raw.functionsAffected === 'number' ? raw.functionsAffected : 0,
                modulesAffected: Array.isArray(raw.modulesAffected)
                    ? raw.modulesAffected.filter((item) => typeof item === 'string')
                    : [],
                dependenciesAdded: Array.isArray(raw.dependenciesAdded)
                    ? raw.dependenciesAdded.filter((item) => typeof item === 'string')
                    : [],
                riskScore: riskScore,
            };
        })()
        : undefined;
    const suspiciousChange = record.suspiciousChange && typeof record.suspiciousChange === 'object' && !Array.isArray(record.suspiciousChange)
        ? (() => {
            const raw = record.suspiciousChange;
            const confidenceRaw = typeof raw.confidence === 'string' ? raw.confidence.toLowerCase() : 'low';
            const confidence = confidenceRaw === 'high' || confidenceRaw === 'medium' ? confidenceRaw : 'low';
            return {
                expectedFiles: typeof raw.expectedFiles === 'number' ? raw.expectedFiles : 0,
                actualFiles: typeof raw.actualFiles === 'number' ? raw.actualFiles : 0,
                unexpectedFiles: Array.isArray(raw.unexpectedFiles)
                    ? raw.unexpectedFiles.filter((item) => typeof item === 'string')
                    : [],
                flagged: raw.flagged === true,
                confidence: confidence,
            };
        })()
        : undefined;
    const changeJustification = record.changeJustification && typeof record.changeJustification === 'object' && !Array.isArray(record.changeJustification)
        ? (() => {
            const raw = record.changeJustification;
            return {
                task: typeof raw.task === 'string' ? raw.task : '',
                changes: Array.isArray(raw.changes)
                    ? raw.changes
                        .filter((item) => !!item && typeof item === 'object')
                        .map((item) => ({
                        file: typeof item.file === 'string' ? item.file : 'unknown',
                        reason: typeof item.reason === 'string' ? item.reason : '',
                    }))
                    : [],
            };
        })()
        : undefined;
    const governanceDecision = record.governanceDecision && typeof record.governanceDecision === 'object' && !Array.isArray(record.governanceDecision)
        ? (() => {
            const raw = record.governanceDecision;
            const decisionRaw = typeof raw.decision === 'string' ? raw.decision.toLowerCase() : 'allow';
            const decision = decisionRaw === 'warn' || decisionRaw === 'manual_approval' || decisionRaw === 'block'
                ? decisionRaw
                : 'allow';
            return {
                decision: decision,
                reasonCodes: Array.isArray(raw.reasonCodes)
                    ? raw.reasonCodes.filter((item) => typeof item === 'string')
                    : [],
                summary: typeof raw.summary === 'string' ? raw.summary : undefined,
                averageRelevanceScore: typeof raw.averageRelevanceScore === 'number' ? raw.averageRelevanceScore : undefined,
                lowRelevanceFiles: Array.isArray(raw.lowRelevanceFiles)
                    ? raw.lowRelevanceFiles
                        .filter((item) => !!item && typeof item === 'object')
                        .map((item) => ({
                        file: typeof item.file === 'string' ? item.file : 'unknown',
                        relevanceScore: typeof item.relevanceScore === 'number' ? item.relevanceScore : 0,
                        planLink: typeof item.planLink === 'string' ? item.planLink : 'unknown',
                    }))
                    : undefined,
                requiresManualApproval: raw.requiresManualApproval === true,
            };
        })()
        : undefined;
    const aiChangeLog = record.aiChangeLog && typeof record.aiChangeLog === 'object' && !Array.isArray(record.aiChangeLog)
        ? (() => {
            const raw = record.aiChangeLog;
            const integrityRaw = raw.integrity && typeof raw.integrity === 'object' && !Array.isArray(raw.integrity)
                ? raw.integrity
                : null;
            return {
                path: typeof raw.path === 'string' ? raw.path : undefined,
                auditPath: typeof raw.auditPath === 'string' ? raw.auditPath : undefined,
                integrity: integrityRaw
                    ? {
                        valid: integrityRaw.valid === true,
                        required: integrityRaw.required === true,
                        signed: integrityRaw.signed === true,
                        issues: Array.isArray(integrityRaw.issues)
                            ? integrityRaw.issues.filter((item) => typeof item === 'string')
                            : [],
                        payloadHash: typeof integrityRaw.payloadHash === 'string' ? integrityRaw.payloadHash : null,
                        chainHash: typeof integrityRaw.chainHash === 'string' ? integrityRaw.chainHash : null,
                        keyId: typeof integrityRaw.keyId === 'string' ? integrityRaw.keyId : null,
                        verifiedWithKeyId: typeof integrityRaw.verifiedWithKeyId === 'string'
                            ? integrityRaw.verifiedWithKeyId
                            : null,
                    }
                    : undefined,
            };
        })()
        : undefined;
    const policySources = record.policySources && typeof record.policySources === 'object' && !Array.isArray(record.policySources)
        ? (() => {
            const raw = record.policySources;
            const modeRaw = typeof raw.mode === 'string' ? raw.mode.toLowerCase() : 'local';
            const mode = modeRaw === 'merged' || modeRaw === 'org_only' ? modeRaw : 'local';
            return {
                localPolicy: raw.localPolicy !== false,
                orgPolicy: raw.orgPolicy === true,
                mode: mode,
            };
        })()
        : undefined;
    const orgGovernance = record.orgGovernance && typeof record.orgGovernance === 'object' && !Array.isArray(record.orgGovernance)
        ? (() => {
            const raw = record.orgGovernance;
            return {
                requireSignedAiLogs: raw.requireSignedAiLogs === true,
                requireManualApproval: raw.requireManualApproval !== false,
                minimumManualApprovals: typeof raw.minimumManualApprovals === 'number'
                    ? Math.max(1, Math.min(5, Math.floor(raw.minimumManualApprovals)))
                    : 1,
                updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
            };
        })()
        : undefined;
    return {
        grade: record.grade,
        score: typeof record.score === 'number' ? record.score : 0,
        verdict: record.verdict,
        violations,
        message: typeof record.message === 'string' ? record.message : undefined,
        tier: typeof record.tier === 'string' ? record.tier : undefined,
        adherenceScore: typeof record.adherenceScore === 'number' ? record.adherenceScore : undefined,
        scopeGuardPassed: typeof record.scopeGuardPassed === 'boolean' ? record.scopeGuardPassed : undefined,
        bloatCount: typeof record.bloatCount === 'number' ? record.bloatCount : undefined,
        bloatFiles: Array.isArray(record.bloatFiles)
            ? record.bloatFiles.filter((item) => typeof item === 'string')
            : undefined,
        plannedFilesModified: typeof record.plannedFilesModified === 'number' ? record.plannedFilesModified : undefined,
        totalPlannedFiles: typeof record.totalPlannedFiles === 'number' ? record.totalPlannedFiles : undefined,
        policyDecision: typeof record.policyDecision === 'string' ? record.policyDecision : undefined,
        policyLock,
        policyExceptions,
        policyGovernance,
        contextPolicy,
        blastRadius,
        suspiciousChange,
        changeJustification,
        governanceDecision,
        aiChangeLog,
        policySources,
        orgGovernance,
    };
}
function parsePlanPayload(output) {
    const parsed = extractLastJsonObject(output);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return null;
    const record = parsed;
    if (typeof record.success !== 'boolean') {
        return null;
    }
    const planIdValue = record.planId;
    const planId = typeof planIdValue === 'string' && planIdValue.trim().length > 0 ? planIdValue : null;
    return {
        success: record.success,
        planId,
        sessionId: typeof record.sessionId === 'string' ? record.sessionId : null,
        projectId: typeof record.projectId === 'string' ? record.projectId : null,
        mode: typeof record.mode === 'string' ? record.mode : undefined,
        cached: typeof record.cached === 'boolean' ? record.cached : undefined,
        timestamp: typeof record.timestamp === 'string' ? record.timestamp : undefined,
        message: typeof record.message === 'string' ? record.message : undefined,
    };
}
function parseApplyPayload(output) {
    const parsed = extractLastJsonObject(output);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return null;
    const record = parsed;
    if (typeof record.success !== 'boolean' || typeof record.planId !== 'string') {
        return null;
    }
    const files = Array.isArray(record.files)
        ? record.files
            .filter((item) => !!item && typeof item === 'object')
            .map((item) => ({
            path: typeof item.path === 'string' ? item.path : '',
            content: typeof item.content === 'string' ? item.content : '',
        }))
            .filter((item) => item.path.length > 0)
        : [];
    const writtenFiles = Array.isArray(record.writtenFiles)
        ? record.writtenFiles.filter((item) => typeof item === 'string')
        : undefined;
    return {
        success: record.success,
        planId: record.planId,
        filesGenerated: typeof record.filesGenerated === 'number' ? record.filesGenerated : files.length,
        files,
        writtenFiles,
        message: typeof record.message === 'string' ? record.message : undefined,
    };
}
function isInfoOnlyGovernanceResult(payload) {
    if (payload.verdict !== 'INFO')
        return false;
    const tier = (payload.tier || '').trim().toUpperCase();
    if (tier === 'FREE')
        return true;
    const message = (payload.message || '').toLowerCase();
    return (message.includes('pro required for policy verification') ||
        message.includes('basic file change summary'));
}
function isEnabledFlag(value) {
    if (!value)
        return false;
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
function isSignedAiLogsRequired(orgGovernance) {
    const explicitRequirement = isEnabledFlag(process.env.NEURCODE_GOVERNANCE_REQUIRE_SIGNED_LOGS) ||
        isEnabledFlag(process.env.NEURCODE_AI_LOG_REQUIRE_SIGNED);
    if (explicitRequirement) {
        return true;
    }
    const honorOrgRequirement = isEnabledFlag(process.env.NEURCODE_GOVERNANCE_ENFORCE_ORG_SIGNED_LOG_REQUIREMENT);
    return honorOrgRequirement && orgGovernance?.requireSignedAiLogs === true;
}
function collectApplyWrittenFiles(output) {
    const clean = stripAnsi(output);
    const files = [];
    let match;
    while ((match = WRITE_PATH_PATTERN.exec(clean)) !== null) {
        files.push(match[1].trim());
    }
    return Array.from(new Set(files));
}
function runGit(cwd, args) {
    const result = (0, child_process_1.spawnSync)('git', args, {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
        code: result.status ?? 1,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
    };
}
function getHeadSha(cwd) {
    const head = runGit(cwd, ['rev-parse', 'HEAD']);
    if (head.code !== 0)
        return null;
    const value = head.stdout.trim().toLowerCase();
    return value || null;
}
function resolveDistinctManualApprovers(cwd, commitSha) {
    const approvals = (0, manual_approvals_1.getManualApprovalsForCommit)(cwd, commitSha);
    return {
        approvals,
        distinctApprovers: (0, manual_approvals_1.countDistinctApprovers)(approvals),
    };
}
function getPrimaryGitRemoteUrl(cwd) {
    const remote = runGit(cwd, ['remote', 'get-url', 'origin']);
    if (remote.code !== 0)
        return null;
    const url = remote.stdout.trim();
    if (!url)
        return null;
    return url;
}
function sanitizeCardForCloud(card) {
    const cloned = JSON.parse(JSON.stringify(card));
    const repository = cloned.repository;
    if (repository && typeof repository === 'object' && !Array.isArray(repository)) {
        delete repository.root;
    }
    return cloned;
}
function parsePorcelainPath(line) {
    const raw = line.slice(3).trim().replace(/\\/g, '/');
    const renameArrow = raw.lastIndexOf(' -> ');
    return renameArrow >= 0 ? raw.slice(renameArrow + 4) : raw;
}
function ensureCleanTreeOrExit(cwd, allowDirty) {
    const status = runGit(cwd, ['status', '--porcelain']);
    const lines = status.stdout
        .split('\n')
        .map((line) => line.trimEnd())
        .filter(Boolean);
    const relevantPaths = lines
        .map((line) => parsePorcelainPath(line))
        .filter((path) => {
        return path !== '.neurcode/config.json';
    });
    const hasDirtyFiles = relevantPaths.length > 0;
    if (hasDirtyFiles && !allowDirty) {
        const error = new Error(`WORKTREE_DIRTY:${relevantPaths.slice(0, 5).join(', ')}`);
        error.dirtyPaths = relevantPaths;
        throw error;
    }
    return relevantPaths;
}
function restoreScopeDriftFiles(cwd, files) {
    const uniqueFiles = Array.from(new Set(files.filter(Boolean)));
    if (uniqueFiles.length === 0)
        return [];
    const result = runGit(cwd, ['restore', '--worktree', '--source=HEAD', '--', ...uniqueFiles]);
    if (result.code !== 0) {
        return [];
    }
    return uniqueFiles;
}
function applySimplePolicyFixes(cwd, violations) {
    const touched = [];
    const byFile = new Map();
    for (const violation of violations) {
        if (!violation.file || violation.file === 'unknown')
            continue;
        if (!byFile.has(violation.file)) {
            byFile.set(violation.file, []);
        }
        byFile.get(violation.file).push(violation);
    }
    for (const [file, fileViolations] of byFile.entries()) {
        const fullPath = (0, path_1.resolve)(cwd, file);
        if (!(0, fs_1.existsSync)(fullPath))
            continue;
        let content;
        try {
            content = (0, fs_1.readFileSync)(fullPath, 'utf-8');
        }
        catch {
            continue;
        }
        let nextContent = content;
        const flattened = fileViolations
            .map((entry) => `${entry.rule} ${entry.message || ''}`.toLowerCase())
            .join(' ');
        if (flattened.includes('console.log')) {
            nextContent = nextContent
                .split('\n')
                .filter((line) => !/console\.log\s*\(/.test(line))
                .join('\n');
        }
        if (flattened.includes('debugger')) {
            nextContent = nextContent
                .split('\n')
                .filter((line) => !/\bdebugger\b/.test(line))
                .join('\n');
        }
        if (flattened.includes('eval(') || flattened.includes('no eval')) {
            nextContent = nextContent
                .split('\n')
                .filter((line) => !/\beval\s*\(/.test(line))
                .join('\n');
        }
        if (flattened.includes('potential-secret-default') ||
            flattened.includes('potential secret') ||
            flattened.includes('api key') ||
            flattened.includes('token') ||
            flattened.includes('password')) {
            nextContent = nextContent
                .replace(/\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)\s*=\s*[^\s`]+/g, '$1=<set-in-env>')
                .replace(/\b(api[_-]?key|token|password|secret)\s*[:=]\s*["'`][^"'`\n]+["'`]/gi, '$1: "<set-in-env>"')
                .replace(/\b(api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,\n]+/gi, '$1: <set-in-env>');
        }
        if (nextContent !== content) {
            if (content.endsWith('\n') && !nextContent.endsWith('\n')) {
                nextContent += '\n';
            }
            (0, fs_1.writeFileSync)(fullPath, nextContent, 'utf-8');
            touched.push(file);
        }
    }
    return Array.from(new Set(touched));
}
function collectBlastRadius(cwd) {
    let output = '';
    try {
        output = (0, child_process_1.execSync)('git diff --numstat', {
            cwd,
            encoding: 'utf-8',
            maxBuffer: 1024 * 1024 * 1024,
        });
    }
    catch {
        return {
            changedFiles: 0,
            linesAdded: 0,
            linesRemoved: 0,
            netLines: 0,
            topFiles: [],
        };
    }
    const rows = [];
    let linesAdded = 0;
    let linesRemoved = 0;
    for (const line of output.split('\n')) {
        if (!line.trim())
            continue;
        const [addedRaw, removedRaw, ...pathParts] = line.split('\t');
        if (!addedRaw || !removedRaw || pathParts.length === 0)
            continue;
        const path = pathParts.join('\t');
        const added = addedRaw === '-' ? 0 : parseInt(addedRaw, 10);
        const removed = removedRaw === '-' ? 0 : parseInt(removedRaw, 10);
        if (!Number.isFinite(added) || !Number.isFinite(removed))
            continue;
        rows.push({ path, added, removed });
        linesAdded += added;
        linesRemoved += removed;
    }
    rows.sort((a, b) => b.added + b.removed - (a.added + a.removed));
    return {
        changedFiles: rows.length,
        linesAdded,
        linesRemoved,
        netLines: linesAdded - linesRemoved,
        topFiles: rows.slice(0, 10),
    };
}
function inferTestCommand(cwd, explicit) {
    if (explicit && explicit.trim()) {
        return explicit.trim();
    }
    if ((0, fs_1.existsSync)((0, path_1.join)(cwd, 'pnpm-lock.yaml')))
        return 'pnpm test --if-present';
    if ((0, fs_1.existsSync)((0, path_1.join)(cwd, 'yarn.lock')))
        return 'yarn test';
    if ((0, fs_1.existsSync)((0, path_1.join)(cwd, 'package-lock.json')))
        return 'npm test --if-present';
    if ((0, fs_1.existsSync)((0, path_1.join)(cwd, 'package.json')))
        return 'npm test --if-present';
    return null;
}
function isNonRemediableTestFailure(output) {
    const text = stripAnsi(output).toLowerCase();
    return (text.includes('command "test:ci" not found') ||
        text.includes('command not found') ||
        text.includes('turbo: command not found') ||
        text.includes('err_module_not_found') ||
        text.includes('cannot find module') ||
        text.includes('module_not_found') ||
        text.includes('enoent') ||
        text.includes('err_pnpm_recursive_exec_first_fail'));
}
function isDocumentationOnlyGoal(goal) {
    const normalized = goal.toLowerCase();
    const hasDocIntent = normalized.includes('readme') ||
        normalized.includes('documentation') ||
        normalized.includes('docs') ||
        normalized.includes('changelog');
    if (!hasDocIntent)
        return false;
    const codeSignals = [
        '.ts',
        '.tsx',
        '.js',
        '.jsx',
        '.py',
        '.go',
        '.java',
        'implement api',
        'refactor logic',
        'fix bug in',
        'middleware',
    ];
    return !codeSignals.some((signal) => normalized.includes(signal));
}
function isDocumentationPath(filePath) {
    const normalized = filePath.trim().replace(/\\/g, '/').toLowerCase();
    if (!normalized)
        return false;
    if (normalized === 'readme.md')
        return true;
    if (normalized.endsWith('.md'))
        return true;
    if (normalized.startsWith('docs/'))
        return true;
    if (normalized.includes('/docs/'))
        return true;
    return false;
}
function buildDocumentationOnlyIntent(goal, strictReadmeOnly) {
    if (strictReadmeOnly) {
        return [
            goal,
            '',
            'NON-NEGOTIABLE CONSTRAINTS:',
            '- Modify ONLY README.md',
            '- Do NOT modify any source code files (.ts/.tsx/.js/.jsx/.py/.go/etc.)',
            '- Set all non-README targets to BLOCK',
            '- Keep change strictly documentation-focused',
        ].join('\n');
    }
    return [
        goal,
        '',
        'CONSTRAINTS:',
        '- Modify documentation files only (README.md and/or docs/*.md)',
        '- Do NOT modify source code files',
        '- Keep all changes documentation-only',
    ].join('\n');
}
async function validateDocumentationPlanScope(planId) {
    try {
        const config = (0, config_1.loadConfig)();
        if (!config.apiKey) {
            return { valid: true, nonDocPaths: [] };
        }
        const client = new api_client_1.ApiClient(config);
        const plan = await client.getPlan(planId);
        const targetedPaths = (plan.content?.files || [])
            .filter((file) => file.action !== 'BLOCK')
            .map((file) => file.path);
        const nonDocPaths = targetedPaths.filter((path) => !isDocumentationPath(path));
        return {
            valid: nonDocPaths.length === 0,
            nonDocPaths,
        };
    }
    catch {
        return { valid: true, nonDocPaths: [] };
    }
}
function buildVerifyRepairIntent(goal, currentPlanId, verify, attempt) {
    const failureLines = verify.violations
        .slice(0, 12)
        .map((v) => `- ${v.file} [${v.severity}] ${v.rule}${v.message ? `: ${v.message}` : ''}`)
        .join('\n');
    return [
        `Original goal: ${goal}`,
        `Auto-repair attempt: ${attempt}`,
        `Current failing plan ID: ${currentPlanId}`,
        '',
        'Repair only what is required to pass governance verification.',
        'Constraints:',
        '- Keep edits minimal and localized.',
        '- Do not add new dependencies.',
        '- Remove unplanned file changes.',
        '- Preserve intended behavior.',
        '',
        'Current verification failures:',
        failureLines || '- Scope or policy checks failed.',
    ].join('\n');
}
function buildTestRepairIntent(goal, currentPlanId, testOutput, attempt) {
    return [
        `Original goal: ${goal}`,
        `Auto-repair attempt: ${attempt}`,
        `Current plan ID: ${currentPlanId}`,
        '',
        'Fix test failures with the smallest safe patch.',
        'Constraints:',
        '- Do not expand scope.',
        '- Keep behavior changes limited to what tests require.',
        '- Do not add risky dependencies.',
        '',
        'Test failure context (tail):',
        shellTailLines(testOutput, 40) || '(no test output captured)',
    ].join('\n');
}
function classifyRiskLabel(score) {
    if (score >= 70)
        return 'HIGH';
    if (score >= 40)
        return 'MEDIUM';
    return 'LOW';
}
function computeRiskScore(verify, blast, testsPassed, remediationAttempts) {
    const adherence = Number.isFinite(verify.adherenceScore) ? verify.adherenceScore : verify.score;
    let risk = 0;
    if (verify.verdict === 'FAIL')
        risk += 52;
    else if (verify.verdict === 'WARN')
        risk += 30;
    else
        risk += 12;
    risk += Math.round((100 - clamp(adherence, 0, 100)) * 0.3);
    risk += Math.min(28, verify.violations.length * 4);
    risk += Math.min(20, Math.max(0, blast.changedFiles - 3) * 2);
    risk += Math.min(18, Math.floor((blast.linesAdded + blast.linesRemoved) / 100) * 3);
    risk += remediationAttempts * 5;
    if (!testsPassed) {
        risk += 20;
    }
    return clamp(Math.round(risk), 0, 100);
}
function writeMergeConfidenceArtifacts(cwd, card) {
    const outDir = (0, path_1.join)(cwd, '.neurcode', 'ship');
    (0, fs_1.mkdirSync)(outDir, { recursive: true });
    const ts = card.generatedAt.replace(/[:.]/g, '-');
    const jsonPath = (0, path_1.join)(outDir, `merge-confidence-${ts}.json`);
    const markdownPath = (0, path_1.join)(outDir, `merge-confidence-${ts}.md`);
    const markdown = [
        '# Merge Confidence Card',
        '',
        `- Status: **${card.status}**`,
        `- Goal: ${card.goal}`,
        `- Branch: ${card.repository.branch}`,
        `- Head SHA: ${card.repository.headSha}`,
        `- Initial Plan: ${card.plans.initialPlanId}`,
        `- Final Plan: ${card.plans.finalPlanId}`,
        '',
        '## Governance',
        '',
        `- Verdict: **${card.verification.verdict}**`,
        `- Grade: **${card.verification.grade}**`,
        `- Score: **${card.verification.adherenceScore ?? card.verification.score}**`,
        `- Violations: **${card.verification.violations.length}**`,
        `- Policy Lock: **${card.verification.policyLock?.enforced ? `enforced (${card.verification.policyLock.matched ? 'matched' : 'mismatch'})` : 'not enforced'}**`,
        `- Policy Exceptions Suppressed: **${card.verification.policyExceptions?.suppressed ?? 0}**`,
        `- Policy Exceptions Blocked: **${card.verification.policyExceptions?.blocked ?? 0}**`,
        `- Approval Governance: **${card.verification.policyGovernance?.exceptionApprovals?.required ? `required (${card.verification.policyGovernance.exceptionApprovals.minApprovals})` : 'not required'}**`,
        `- Audit Integrity: **${card.verification.policyGovernance?.audit?.requireIntegrity ? (card.verification.policyGovernance.audit.valid ? 'required+valid' : 'required+invalid') : 'not required'}**`,
        '',
        '## Blast Radius',
        '',
        `- Files Changed: **${card.blastRadius.changedFiles}**`,
        `- Lines Added: **${card.blastRadius.linesAdded}**`,
        `- Lines Removed: **${card.blastRadius.linesRemoved}**`,
        `- Net Lines: **${card.blastRadius.netLines}**`,
        '',
        '## Risk',
        '',
        `- Risk Score: **${card.risk.score}/100 (${card.risk.label})**`,
        `- Merge Confidence: **${card.risk.mergeConfidence}/100**`,
        '',
        '## What Would Have Broken?',
        '',
        `- Impacted Files: **${card.simulator?.impactedFiles ?? 0}**`,
        `- Predicted Regressions: **${card.simulator?.predictedRegressions ?? 0}**`,
        ...(card.simulator && card.simulator.topRegressions.length > 0
            ? card.simulator.topRegressions.map((item) => `- [${item.severity.toUpperCase()} ${(item.confidence * 100).toFixed(0)}%] ${item.title}`)
            : ['- none']),
        '',
        '## Auto-Remediation',
        '',
        `- Attempts Used: **${card.remediation.attemptsUsed}/${card.remediation.maxAttempts}**`,
        `- Actions: ${card.remediation.actions.length > 0 ? card.remediation.actions.join('; ') : 'None'}`,
        '',
        '## Tests',
        '',
        `- Skipped: **${card.tests.skipped ? 'yes' : 'no'}**`,
        `- Passed: **${card.tests.passed ? 'yes' : 'no'}**`,
        card.tests.command ? `- Command: \`${card.tests.command}\`` : '- Command: none',
        '',
        '## Execution Audit',
        '',
        `- Run ID: \`${card.audit.runId}\``,
        `- Started: ${card.audit.startedAt}`,
        `- Finished: ${card.audit.finishedAt}`,
        `- Duration: **${card.audit.durationMs}ms**`,
        `- Timeouts (ms): plan=${card.audit.timeoutMs.plan}, apply=${card.audit.timeoutMs.apply}, verify=${card.audit.timeoutMs.verify}, tests=${card.audit.timeoutMs.tests}`,
        `- Heartbeat: ${card.audit.heartbeatMs}ms`,
        '- Step Timeline:',
        ...(card.audit.steps.length > 0
            ? card.audit.steps.map((step) => `  - ${step.stage}#${step.attempt} ${step.status} (${step.durationMs}ms)${typeof step.exitCode === 'number' ? ` exit=${step.exitCode}` : ''}${step.planId ? ` plan=${step.planId}` : ''}${step.message ? ` :: ${step.message}` : ''}`)
            : ['  - none']),
        '',
        '## Top Changed Files',
        '',
        ...(card.blastRadius.topFiles.length > 0
            ? card.blastRadius.topFiles.map((file) => `- ${file.path} (+${file.added}/-${file.removed})`)
            : ['- none']),
        '',
        '## Evidence (Violations)',
        '',
        ...(card.verification.violations.length > 0
            ? card.verification.violations.slice(0, 20).map((v) => `- ${v.file}${typeof v.startLine === 'number' ? `:${v.startLine}` : ''} [${v.severity}] ${v.rule}${v.message ? ` - ${v.message}` : ''}`)
            : ['- none']),
        '',
    ].join('\n');
    (0, fs_1.writeFileSync)(jsonPath, JSON.stringify(card, null, 2) + '\n', 'utf-8');
    (0, fs_1.writeFileSync)(markdownPath, markdown, 'utf-8');
    return { jsonPath, markdownPath };
}
function sha256Hex(input) {
    return (0, crypto_1.createHash)('sha256').update(input, 'utf-8').digest('hex');
}
function writeReleaseAttestation(cwd, card, artifacts) {
    const outDir = (0, path_1.join)(cwd, '.neurcode', 'ship', 'attestations');
    (0, fs_1.mkdirSync)(outDir, { recursive: true });
    const attestationBase = {
        schemaVersion: 1,
        attestationId: `att_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
        generatedAt: new Date().toISOString(),
        runId: card.audit.runId,
        status: card.status,
        repository: {
            root: card.repository.root,
            branch: card.repository.branch,
            headSha: card.repository.headSha,
        },
        card: {
            jsonPath: artifacts.jsonPath,
            markdownPath: artifacts.markdownPath,
            sha256: sha256Hex((0, fs_1.readFileSync)(artifacts.jsonPath, 'utf-8')),
        },
        plans: {
            initialPlanId: card.plans.initialPlanId,
            finalPlanId: card.plans.finalPlanId,
            repairPlanIds: [...card.plans.repairPlanIds],
        },
        verification: {
            verdict: card.verification.verdict,
            grade: card.verification.grade,
            score: Number.isFinite(card.verification.adherenceScore)
                ? card.verification.adherenceScore
                : card.verification.score,
            violations: card.verification.violations.length,
            policyLock: {
                enforced: card.verification.policyLock?.enforced === true,
                matched: card.verification.policyLock?.matched !== false,
            },
            policyExceptions: {
                matched: card.verification.policyExceptions?.matched ?? 0,
                suppressed: card.verification.policyExceptions?.suppressed ?? 0,
                blocked: card.verification.policyExceptions?.blocked ?? 0,
                matchedExceptionIds: card.verification.policyExceptions?.matchedExceptionIds
                    ? [...card.verification.policyExceptions.matchedExceptionIds]
                    : [],
            },
            policyGovernance: {
                approvalRequired: card.verification.policyGovernance?.exceptionApprovals?.required === true,
                minApprovals: card.verification.policyGovernance?.exceptionApprovals?.minApprovals ?? 1,
                disallowSelfApproval: card.verification.policyGovernance?.exceptionApprovals?.disallowSelfApproval !== false,
                allowedApprovers: card.verification.policyGovernance?.exceptionApprovals?.allowedApprovers
                    ? [...card.verification.policyGovernance.exceptionApprovals.allowedApprovers]
                    : [],
                auditIntegrityRequired: card.verification.policyGovernance?.audit?.requireIntegrity === true,
                auditIntegrityValid: card.verification.policyGovernance?.audit?.valid !== false,
            },
        },
        tests: {
            skipped: card.tests.skipped,
            passed: card.tests.passed,
            attempts: card.tests.attempts,
            lastExitCode: card.tests.lastExitCode,
        },
        remediation: {
            attemptsUsed: card.remediation.attemptsUsed,
            maxAttempts: card.remediation.maxAttempts,
        },
    };
    const hmacKey = process.env.NEURCODE_ATTEST_HMAC_KEY;
    const signature = hmacKey
        ? {
            algorithm: 'hmac-sha256',
            keyId: process.env.NEURCODE_ATTEST_KEY_ID || null,
            value: (0, crypto_1.createHmac)('sha256', hmacKey)
                .update(JSON.stringify(attestationBase), 'utf-8')
                .digest('hex'),
        }
        : null;
    const attestation = {
        ...attestationBase,
        signature,
    };
    const ts = attestation.generatedAt.replace(/[:.]/g, '-');
    const attestationPath = (0, path_1.join)(outDir, `release-attestation-${ts}.json`);
    (0, fs_1.writeFileSync)(attestationPath, JSON.stringify(attestation, null, 2) + '\n', 'utf-8');
    return attestationPath;
}
async function runPlanAndApply(cwd, intent, projectId, controls) {
    const planArgs = ['plan', intent, '--force-plan', '--json'];
    if (projectId) {
        planArgs.push('--project-id', projectId);
    }
    const planRun = await runCliCommand(cwd, planArgs, {
        NEURCODE_PLAN_SKIP_SNAPSHOTS: '1',
    }, {
        timeoutMs: getPlanTimeoutMs(),
        label: 'ship:plan',
        streamOutput: controls?.streamOutput !== false,
    });
    const planOutput = `${planRun.stdout}\n${planRun.stderr}`;
    const parsedPlan = parsePlanPayload(planOutput);
    const planId = parsedPlan?.success && parsedPlan.planId
        ? parsedPlan.planId
        : extractPlanId(planOutput);
    if (planRun.code !== 0 || !planId || parsedPlan?.success === false) {
        return { planId: null, planRun, applyRun: null, writtenFiles: [] };
    }
    if (controls?.enforceDocumentationScope) {
        const scopeCheck = await validateDocumentationPlanScope(planId);
        if (!scopeCheck.valid) {
            return {
                planId,
                planRun,
                applyRun: {
                    code: 9,
                    stdout: '',
                    stderr: `DOC_SCOPE_VIOLATION: ${scopeCheck.nonDocPaths.join(', ')}`,
                    durationMs: 0,
                },
                writtenFiles: [],
            };
        }
    }
    const applyArgs = ['apply', planId, '--force', '--json'];
    const applyRun = await runCliCommand(cwd, applyArgs, undefined, {
        timeoutMs: getApplyTimeoutMs(),
        label: 'ship:apply',
        streamOutput: controls?.streamOutput !== false,
    });
    const applyOutput = `${applyRun.stdout}\n${applyRun.stderr}`;
    const parsedApply = parseApplyPayload(applyOutput);
    const normalizedApplyRun = parsedApply?.success === false && applyRun.code === 0
        ? { ...applyRun, code: 1 }
        : applyRun;
    const writtenFiles = parsedApply?.writtenFiles && parsedApply.writtenFiles.length > 0
        ? Array.from(new Set(parsedApply.writtenFiles))
        : parsedApply?.files && parsedApply.files.length > 0
            ? Array.from(new Set(parsedApply.files.map((item) => item.path)))
            : collectApplyWrittenFiles(applyOutput);
    return { planId, planRun, applyRun: normalizedApplyRun, writtenFiles };
}
async function shipCommand(goal, options) {
    if (options.json === true) {
        console.log = (() => undefined);
        console.warn = (() => undefined);
    }
    const streamStepOutput = options.json !== true;
    const resumedStart = options.resumeStartedAtIso ? Date.parse(options.resumeStartedAtIso) : NaN;
    const startedAt = Number.isFinite(resumedStart) && resumedStart > 0 ? resumedStart : Date.now();
    const startedAtIso = new Date(startedAt).toISOString();
    const runId = options.resumeRunId || `ship_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
    const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const maxFixAttempts = clamp(options.maxFixAttempts ?? 2, 0, 5);
    const requirePass = options.requirePass === true || process.env.NEURCODE_SHIP_REQUIRE_PASS === '1';
    const requirePolicyLock = options.requirePolicyLock === true || process.env.NEURCODE_SHIP_REQUIRE_POLICY_LOCK === '1';
    const skipPolicyLock = options.skipPolicyLock === true || process.env.NEURCODE_SHIP_SKIP_POLICY_LOCK === '1';
    const remediationActions = [];
    const repairPlanIds = Array.isArray(options.resumeRepairPlanIds)
        ? [...options.resumeRepairPlanIds]
        : [];
    const recordVerify = options.record !== false;
    const auditSteps = [];
    const timeoutConfig = {
        plan: getPlanTimeoutMs(),
        apply: getApplyTimeoutMs(),
        verify: getVerifyTimeoutMs(),
        tests: getTestTimeoutMs(),
    };
    const heartbeatMs = getHeartbeatIntervalMs();
    const buildAuditSnapshot = () => {
        const finishedAt = new Date().toISOString();
        return {
            runId,
            startedAt: startedAtIso,
            finishedAt,
            durationMs: Date.now() - startedAt,
            timeoutMs: timeoutConfig,
            heartbeatMs,
            steps: auditSteps,
        };
    };
    const checkpoint = createShipCheckpoint({
        runId,
        goal: goal || '',
        cwd,
        startedAt: startedAtIso,
        maxFixAttempts,
        options,
        requirePass,
        requirePolicyLock,
        skipPolicyLock,
    });
    if (options.resumeFromPlanId) {
        checkpoint.stage = 'planned';
        checkpoint.initialPlanId = options.resumeInitialPlanId || options.resumeFromPlanId;
        checkpoint.currentPlanId = options.resumeFromPlanId;
        checkpoint.repairPlanIds = [...repairPlanIds];
        checkpoint.remediationAttemptsUsed = Math.max(0, options.resumeRemediationAttempts ?? 0);
    }
    const persistCheckpoint = (mutate) => {
        try {
            if (mutate)
                mutate(checkpoint);
            checkpoint.updatedAt = new Date().toISOString();
            saveShipCheckpoint(cwd, checkpoint);
        }
        catch {
            // Checkpoint persistence is best-effort and must not break ship runs.
        }
    };
    persistCheckpoint();
    const emitShipErrorAndExit = (input) => {
        const exitCode = input.exitCode ?? 1;
        const auditSnapshot = buildAuditSnapshot();
        persistCheckpoint((draft) => {
            draft.status = 'failed';
            draft.stage = 'error';
            draft.currentPlanId = input.finalPlanId || draft.currentPlanId;
            draft.resultStatus = 'ERROR';
            draft.audit = auditSnapshot;
            draft.error = {
                stage: input.stage,
                code: input.code,
                message: input.message,
                detail: input.detail,
                exitCode,
            };
        });
        if (options.json) {
            emitShipJson({
                success: false,
                status: 'ERROR',
                finalPlanId: input.finalPlanId ?? null,
                mergeConfidence: null,
                riskScore: null,
                artifacts: null,
                shareCard: null,
                error: {
                    stage: input.stage,
                    code: input.code,
                    message: input.message,
                    detail: input.detail,
                    exitCode,
                },
                audit: auditSnapshot,
            });
        }
        process.exit(exitCode);
    };
    if (!goal || !goal.trim()) {
        console.error(chalk.red('❌ Error: goal cannot be empty.'));
        console.log(chalk.dim('Usage: neurcode ship "<goal>"'));
        emitShipErrorAndExit({
            stage: 'input',
            code: 'INVALID_GOAL',
            message: 'goal cannot be empty',
            exitCode: 1,
        });
    }
    const normalizedGoal = goal.trim();
    persistCheckpoint((draft) => {
        draft.goal = normalizedGoal;
    });
    const documentationOnlyGoal = isDocumentationOnlyGoal(normalizedGoal);
    const scopedGoal = documentationOnlyGoal
        ? buildDocumentationOnlyIntent(normalizedGoal, false)
        : normalizedGoal;
    let baselineDirtyPaths = Array.isArray(options.resumeBaselineDirtyPaths)
        ? [...options.resumeBaselineDirtyPaths]
        : [];
    try {
        if (baselineDirtyPaths.length === 0) {
            baselineDirtyPaths = ensureCleanTreeOrExit(cwd, options.allowDirty === true);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const dirtyPaths = error.dirtyPaths ||
            (message.startsWith('WORKTREE_DIRTY:') ? message.replace('WORKTREE_DIRTY:', '').split(',').map((v) => v.trim()).filter(Boolean) : []);
        console.error(chalk.red('❌ Working tree is not clean.'));
        console.error(chalk.dim('   `neurcode ship` requires a clean tree so auto-remediation can safely revert scope drift.'));
        console.error(chalk.dim('   Commit/stash your changes or re-run with --allow-dirty if intentional.'));
        if (dirtyPaths.length > 0) {
            console.error(chalk.dim(`   Dirty paths: ${dirtyPaths.slice(0, 5).join(', ')}`));
        }
        emitShipErrorAndExit({
            stage: 'bootstrap',
            code: 'WORKTREE_DIRTY',
            message: 'Working tree is not clean',
            detail: dirtyPaths.slice(0, 5).join(', '),
            exitCode: 1,
        });
    }
    persistCheckpoint((draft) => {
        draft.stage = 'bootstrap';
        draft.baselineDirtyPaths = [...baselineDirtyPaths];
    });
    const baselineDirtySet = new Set(baselineDirtyPaths.map((p) => p.replace(/\\/g, '/')));
    console.log(chalk.bold.cyan('\n🚀 Neurcode Ship\n'));
    console.log(chalk.dim(`Goal: ${normalizedGoal}`));
    console.log(chalk.dim(`Workspace: ${cwd}\n`));
    if (requirePass) {
        console.log(chalk.dim('ℹ️  strict governance: PASS verdict required (INFO will block this run).'));
    }
    if (baselineDirtyPaths.length > 0 && options.allowDirty) {
        console.log(chalk.dim(`ℹ️  allow-dirty: preserving ${baselineDirtyPaths.length} pre-existing dirty path(s) during verification.`));
    }
    let initialPlanDurationMs = 0;
    let initialApplyDurationMs = 0;
    let remediationAttemptsUsed = Math.max(0, options.resumeRemediationAttempts ?? 0);
    let initialPlanId;
    let currentPlanId;
    if (options.resumeFromPlanId) {
        initialPlanId = options.resumeInitialPlanId || options.resumeFromPlanId;
        currentPlanId = options.resumeFromPlanId;
        console.log(chalk.dim('1/4 Resuming from existing ship checkpoint (skipping plan/apply)...'));
        auditSteps.push({
            stage: 'resume',
            attempt: 1,
            status: 'SUCCESS',
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            durationMs: 0,
            planId: currentPlanId,
            message: `resume_from_plan=${currentPlanId}`,
        });
    }
    else {
        console.log(chalk.dim('1/4 Planning and applying initial implementation...'));
        let planningAttempt = 1;
        let initial = await runPlanAndApply(cwd, scopedGoal, options.projectId, {
            enforceDocumentationScope: documentationOnlyGoal,
            streamOutput: streamStepOutput,
        });
        recordRunStep(auditSteps, {
            stage: 'plan',
            attempt: planningAttempt,
            run: initial.planRun,
            message: 'initial',
            planId: initial.planId || undefined,
        });
        recordRunStep(auditSteps, {
            stage: 'apply',
            attempt: planningAttempt,
            run: initial.applyRun,
            message: 'initial',
            planId: initial.planId || undefined,
        });
        if (documentationOnlyGoal &&
            initial.applyRun &&
            initial.applyRun.code === 9 &&
            initial.applyRun.stderr.startsWith('DOC_SCOPE_VIOLATION')) {
            console.log(chalk.yellow('⚠️  Plan attempted non-documentation files. Retrying with strict README-only scope...'));
            remediationActions.push('documentation_scope_retry');
            const strictGoal = buildDocumentationOnlyIntent(normalizedGoal, true);
            planningAttempt += 1;
            initial = await runPlanAndApply(cwd, strictGoal, options.projectId, {
                enforceDocumentationScope: true,
                streamOutput: streamStepOutput,
            });
            recordRunStep(auditSteps, {
                stage: 'plan',
                attempt: planningAttempt,
                run: initial.planRun,
                message: 'documentation_scope_retry',
                planId: initial.planId || undefined,
            });
            recordRunStep(auditSteps, {
                stage: 'apply',
                attempt: planningAttempt,
                run: initial.applyRun,
                message: 'documentation_scope_retry',
                planId: initial.planId || undefined,
            });
        }
        if (!initial.planId || initial.planRun.code !== 0 || !initial.applyRun || initial.applyRun.code !== 0) {
            console.error(chalk.red('\n❌ Ship failed during initial plan/apply.'));
            const detail = initial.applyRun?.stderr || initial.planRun.stderr || initial.planRun.stdout;
            if (detail) {
                console.error(chalk.dim(`   Details: ${shellTailLines(stripAnsi(detail), 8)}`));
            }
            const failedStage = !initial.planId || initial.planRun.code !== 0 ? 'plan' : 'apply';
            const exitCode = failedStage === 'plan'
                ? initial.planRun.code || 1
                : initial.applyRun?.code || 1;
            emitShipErrorAndExit({
                stage: failedStage,
                code: failedStage === 'plan' ? 'PLAN_APPLY_INIT_FAILED_PLAN' : 'PLAN_APPLY_INIT_FAILED_APPLY',
                message: 'Ship failed during initial plan/apply',
                detail: detail ? shellTailLines(stripAnsi(detail), 12) : undefined,
                exitCode,
                finalPlanId: initial.planId,
            });
        }
        initialPlanId = initial.planId;
        currentPlanId = initialPlanId;
        initialPlanDurationMs = initial.planRun.durationMs;
        initialApplyDurationMs = initial.applyRun ? initial.applyRun.durationMs : 0;
    }
    try {
        (0, state_1.setActivePlanId)(currentPlanId);
        (0, state_1.setLastPlanGeneratedAt)(new Date().toISOString());
    }
    catch {
        // Non-critical state write.
    }
    persistCheckpoint((draft) => {
        draft.stage = 'planned';
        draft.initialPlanId = initialPlanId;
        draft.currentPlanId = currentPlanId;
        draft.repairPlanIds = [...repairPlanIds];
        draft.remediationAttemptsUsed = remediationAttemptsUsed;
    });
    let verifyTotalMs = 0;
    let testsTotalMs = 0;
    let verifyPayload = null;
    let verifyExitCode = 1;
    let testsPassed = options.skipTests === true;
    let testsExitCode = options.skipTests ? 0 : 1;
    let testsAttempts = 0;
    let testCommand = inferTestCommand(cwd, options.testCommand);
    while (true) {
        console.log(chalk.dim('\n2/4 Running governance verification...'));
        const verifyAttempt = remediationAttemptsUsed + 1;
        const verifyArgs = ['verify', '--plan-id', currentPlanId, '--json'];
        if (recordVerify) {
            verifyArgs.push('--record');
        }
        if (requirePolicyLock) {
            verifyArgs.push('--require-policy-lock');
        }
        if (skipPolicyLock) {
            verifyArgs.push('--skip-policy-lock');
        }
        const verifyRun = await runCliCommand(cwd, verifyArgs, baselineDirtyPaths.length > 0
            ? { NEURCODE_VERIFY_IGNORE_PATHS: JSON.stringify(baselineDirtyPaths) }
            : undefined, {
            timeoutMs: getVerifyTimeoutMs(),
            label: 'ship:verify',
            streamOutput: streamStepOutput,
        });
        verifyTotalMs += verifyRun.durationMs;
        verifyExitCode = verifyRun.code;
        recordRunStep(auditSteps, {
            stage: 'verify',
            attempt: verifyAttempt,
            run: verifyRun,
            planId: currentPlanId,
        });
        const parsedVerify = parseVerifyPayload(`${verifyRun.stdout}\n${verifyRun.stderr}`);
        if (!parsedVerify) {
            console.error(chalk.red('\n❌ Could not parse verify JSON output.'));
            emitShipErrorAndExit({
                stage: 'verify',
                code: 'VERIFY_JSON_PARSE_FAILED',
                message: 'Could not parse verify JSON output',
                detail: shellTailLines(stripAnsi(`${verifyRun.stdout}\n${verifyRun.stderr}`), 12),
                exitCode: verifyRun.code === 0 ? 1 : verifyRun.code,
                finalPlanId: currentPlanId,
            });
        }
        const verifiedPayload = parsedVerify;
        verifyPayload = verifiedPayload;
        persistCheckpoint((draft) => {
            draft.stage = 'verify';
            draft.currentPlanId = currentPlanId;
            draft.repairPlanIds = [...repairPlanIds];
            draft.remediationAttemptsUsed = remediationAttemptsUsed;
            draft.verifyExitCode = verifyRun.code;
            draft.verifyPayload = verifiedPayload;
        });
        const verifyPassed = verifyRun.code === 0 &&
            (verifiedPayload.verdict === 'PASS' || (!requirePass && isInfoOnlyGovernanceResult(verifiedPayload)));
        if (verifyPassed) {
            if (verifiedPayload.verdict === 'PASS') {
                console.log(chalk.green('✅ Governance verification passed.'));
            }
            else {
                console.log(chalk.yellow('⚠️  Governance policy checks are tier-limited (INFO); continuing.'));
            }
            break;
        }
        if (verifyRun.code === 0 && requirePass && isInfoOnlyGovernanceResult(verifiedPayload)) {
            remediationActions.push('strict_pass_required_info_block');
            console.log(chalk.red('❌ Governance strict mode requires PASS verdict; verify returned INFO.'));
            break;
        }
        if (remediationAttemptsUsed >= maxFixAttempts) {
            console.log(chalk.red(`❌ Verification still failing after ${remediationAttemptsUsed} remediation attempt(s).`));
            break;
        }
        remediationAttemptsUsed += 1;
        console.log(chalk.yellow(`⚠️  Auto-remediation attempt ${remediationAttemptsUsed}/${maxFixAttempts}`));
        persistCheckpoint((draft) => {
            draft.remediationAttemptsUsed = remediationAttemptsUsed;
        });
        const scopeDriftFiles = verifiedPayload.violations
            .filter((v) => v.rule === 'scope_guard' && v.file)
            .map((v) => v.file)
            .filter((path) => !baselineDirtySet.has(path.replace(/\\/g, '/')));
        const restored = restoreScopeDriftFiles(cwd, scopeDriftFiles);
        if (restored.length > 0) {
            remediationActions.push(`restored_scope_files=${restored.join(',')}`);
            console.log(chalk.dim(`   Restored ${restored.length} out-of-scope file(s) from HEAD.`));
        }
        const policyFixes = applySimplePolicyFixes(cwd, verifiedPayload.violations);
        if (policyFixes.length > 0) {
            remediationActions.push(`policy_cleanup_files=${policyFixes.join(',')}`);
            console.log(chalk.dim(`   Applied simple policy cleanup to ${policyFixes.length} file(s).`));
        }
        if (restored.length > 0 || policyFixes.length > 0) {
            continue;
        }
        console.log(chalk.dim('   Falling back to constrained repair plan...'));
        const repairIntent = buildVerifyRepairIntent(normalizedGoal, currentPlanId, verifiedPayload, remediationAttemptsUsed);
        const repair = await runPlanAndApply(cwd, repairIntent, options.projectId, {
            streamOutput: streamStepOutput,
        });
        recordRunStep(auditSteps, {
            stage: 'plan',
            attempt: remediationAttemptsUsed + 1,
            run: repair.planRun,
            message: 'verify_repair',
            planId: repair.planId || undefined,
        });
        recordRunStep(auditSteps, {
            stage: 'apply',
            attempt: remediationAttemptsUsed + 1,
            run: repair.applyRun,
            message: 'verify_repair',
            planId: repair.planId || undefined,
        });
        if (!repair.planId || repair.planRun.code !== 0 || !repair.applyRun || repair.applyRun.code !== 0) {
            remediationActions.push('repair_plan_failed');
            console.log(chalk.red('   Repair plan/apply failed.'));
            break;
        }
        currentPlanId = repair.planId;
        repairPlanIds.push(repair.planId);
        remediationActions.push(`repair_plan_applied=${repair.planId}`);
        persistCheckpoint((draft) => {
            draft.stage = 'planned';
            draft.currentPlanId = currentPlanId;
            draft.repairPlanIds = [...repairPlanIds];
            draft.remediationAttemptsUsed = remediationAttemptsUsed;
        });
        try {
            (0, state_1.setActivePlanId)(currentPlanId);
            (0, state_1.setLastPlanGeneratedAt)(new Date().toISOString());
        }
        catch {
            // Non-critical state write.
        }
    }
    if (!verifyPayload) {
        console.error(chalk.red('❌ Verification did not produce a valid payload.'));
        emitShipErrorAndExit({
            stage: 'verify',
            code: 'VERIFY_PAYLOAD_MISSING',
            message: 'Verification did not produce a valid payload',
            exitCode: 1,
            finalPlanId: currentPlanId,
        });
    }
    const finalVerifyPayload = verifyPayload;
    let verifyPassedFinal = verifyExitCode === 0 &&
        (finalVerifyPayload.verdict === 'PASS' || (!requirePass && isInfoOnlyGovernanceResult(finalVerifyPayload)));
    const manualApprovalBypass = options.manualApproveHighRisk === true || process.env.NEURCODE_MANUAL_APPROVE_HIGH_RISK === '1';
    const governanceDecision = finalVerifyPayload.governanceDecision?.decision;
    const orgGovernance = finalVerifyPayload.orgGovernance || null;
    const signedAiLogsRequired = isSignedAiLogsRequired(orgGovernance);
    const aiLogIntegrity = finalVerifyPayload.aiChangeLog?.integrity;
    const signedAiLogsValid = aiLogIntegrity?.valid === true && aiLogIntegrity?.signed === true;
    const orgManualApprovalRequired = orgGovernance?.requireManualApproval === true;
    const minimumManualApprovals = orgGovernance
        ? Math.max(1, Math.min(5, Math.floor(orgGovernance.minimumManualApprovals || 1)))
        : 1;
    const approvalHeadSha = getHeadSha(cwd);
    const manualApprovalState = approvalHeadSha
        ? resolveDistinctManualApprovers(cwd, approvalHeadSha)
        : { approvals: [], distinctApprovers: 0 };
    if (verifyPassedFinal && governanceDecision === 'block') {
        verifyPassedFinal = false;
        verifyExitCode = verifyExitCode === 0 ? 2 : verifyExitCode;
        remediationActions.push('governance_decision_block');
        const summary = finalVerifyPayload.governanceDecision?.summary || 'Governance decision matrix returned BLOCK.';
        finalVerifyPayload.message = `${finalVerifyPayload.message || 'Governance verification completed.'} ${summary}`;
        console.log(chalk.red('\n⛔ Ship blocked by governance decision matrix (BLOCK).'));
        if (finalVerifyPayload.governanceDecision?.reasonCodes?.length) {
            console.log(chalk.dim(`   Reasons: ${finalVerifyPayload.governanceDecision.reasonCodes.join(', ')}`));
        }
    }
    if (verifyPassedFinal && signedAiLogsRequired && !signedAiLogsValid) {
        verifyPassedFinal = false;
        verifyExitCode = verifyExitCode === 0 ? 2 : verifyExitCode;
        remediationActions.push('governance_signed_ai_log_required');
        const issues = aiLogIntegrity?.issues?.length ? aiLogIntegrity.issues.join('; ') : 'integrity payload missing';
        finalVerifyPayload.message = `${finalVerifyPayload.message || 'Governance verification completed.'} Signed AI change-log integrity is required (${issues}).`;
        console.log(chalk.red('\n⛔ Ship blocked: signed AI change-log integrity is required.'));
        console.log(chalk.dim(`   Signed required: ${signedAiLogsRequired ? 'yes' : 'no'}`));
        console.log(chalk.dim(`   Signed observed: ${aiLogIntegrity?.signed === true ? 'yes' : 'no'}`));
        console.log(chalk.dim(`   Integrity valid: ${aiLogIntegrity?.valid === true ? 'yes' : 'no'}`));
        if (issues) {
            console.log(chalk.dim(`   Issues: ${issues}`));
        }
    }
    const requiresManualApproval = governanceDecision === 'manual_approval' ||
        (!governanceDecision && finalVerifyPayload.blastRadius?.riskScore === 'high');
    let effectiveDistinctApprovers = manualApprovalState.distinctApprovers;
    if (orgManualApprovalRequired && manualApprovalBypass) {
        // Backward-compatible flag counts as the current operator approval in enterprise mode.
        effectiveDistinctApprovers += 1;
    }
    const manualApprovalSatisfied = orgManualApprovalRequired
        ? effectiveDistinctApprovers >= minimumManualApprovals
        : manualApprovalBypass;
    if (verifyPassedFinal && requiresManualApproval && !manualApprovalSatisfied) {
        verifyPassedFinal = false;
        verifyExitCode = verifyExitCode === 0 ? 2 : verifyExitCode;
        remediationActions.push('governance_manual_approval_required');
        const summary = finalVerifyPayload.governanceDecision?.summary ||
            'High blast-radius risk requires manual approval before ship can continue.';
        finalVerifyPayload.message = `${finalVerifyPayload.message || 'Governance verification completed.'} ${summary}`;
        console.log(chalk.red('\n⛔ Ship blocked: governance requires manual approval before deploy.'));
        if (orgManualApprovalRequired) {
            const recordedCount = manualApprovalState.distinctApprovers;
            console.log(chalk.dim(`   Manual approvals required: ${minimumManualApprovals}, recorded: ${recordedCount}${manualApprovalBypass ? ' (+1 current operator flag)' : ''}`));
            if (approvalHeadSha) {
                console.log(chalk.dim(`   Commit: ${approvalHeadSha}`));
            }
            console.log(chalk.dim('   Record approvals with `neurcode approve --reason "<review context>"`.'));
            console.log(chalk.dim('   Then re-run `neurcode ship ...` to continue.'));
        }
        else {
            console.log(chalk.dim('   Re-run with --manual-approve-high-risk after manual review.'));
        }
        if (typeof finalVerifyPayload.governanceDecision?.averageRelevanceScore === 'number') {
            console.log(chalk.dim(`   Avg relevance score: ${finalVerifyPayload.governanceDecision.averageRelevanceScore}`));
        }
    }
    if (verifyPassedFinal && !options.skipTests) {
        testsAttempts += 1;
        if (!testCommand) {
            console.log(chalk.yellow('\n⚠️  No test command detected. Skipping tests.'));
            testsPassed = true;
            testsExitCode = 0;
            recordRunStep(auditSteps, {
                stage: 'tests',
                attempt: testsAttempts,
                run: null,
                message: 'no_test_command_detected',
                planId: currentPlanId,
            });
        }
        else {
            console.log(chalk.dim(`\n3/4 Running tests: ${testCommand}`));
            const testRun = await runShellCommand(cwd, testCommand, {
                timeoutMs: getTestTimeoutMs(),
                label: 'ship:tests',
                streamOutput: streamStepOutput,
            });
            testsTotalMs += testRun.durationMs;
            testsExitCode = testRun.code;
            testsPassed = testRun.code === 0;
            recordRunStep(auditSteps, {
                stage: 'tests',
                attempt: testsAttempts,
                run: testRun,
                planId: currentPlanId,
            });
            const testOutput = `${testRun.stdout}\n${testRun.stderr}`;
            if (!testsPassed && isNonRemediableTestFailure(testOutput)) {
                remediationActions.push('test_infra_failure');
                console.log(chalk.red('   Test command/tooling failure detected; skipping AI code remediation.'));
            }
            else if (!testsPassed && remediationAttemptsUsed < maxFixAttempts) {
                remediationAttemptsUsed += 1;
                persistCheckpoint((draft) => {
                    draft.remediationAttemptsUsed = remediationAttemptsUsed;
                });
                console.log(chalk.yellow(`⚠️  Test failure auto-remediation attempt ${remediationAttemptsUsed}/${maxFixAttempts}`));
                const repairIntent = buildTestRepairIntent(normalizedGoal, currentPlanId, testOutput, remediationAttemptsUsed);
                const repair = await runPlanAndApply(cwd, repairIntent, options.projectId, {
                    streamOutput: streamStepOutput,
                });
                recordRunStep(auditSteps, {
                    stage: 'plan',
                    attempt: remediationAttemptsUsed + 1,
                    run: repair.planRun,
                    message: 'test_repair',
                    planId: repair.planId || undefined,
                });
                recordRunStep(auditSteps, {
                    stage: 'apply',
                    attempt: remediationAttemptsUsed + 1,
                    run: repair.applyRun,
                    message: 'test_repair',
                    planId: repair.planId || undefined,
                });
                if (repair.planId && repair.planRun.code === 0 && repair.applyRun && repair.applyRun.code === 0) {
                    currentPlanId = repair.planId;
                    repairPlanIds.push(repair.planId);
                    remediationActions.push(`test_repair_plan_applied=${repair.planId}`);
                    persistCheckpoint((draft) => {
                        draft.stage = 'planned';
                        draft.currentPlanId = currentPlanId;
                        draft.repairPlanIds = [...repairPlanIds];
                        draft.remediationAttemptsUsed = remediationAttemptsUsed;
                    });
                    try {
                        (0, state_1.setActivePlanId)(currentPlanId);
                        (0, state_1.setLastPlanGeneratedAt)(new Date().toISOString());
                    }
                    catch {
                        // Non-critical state write.
                    }
                    const verifyAfterTestRepair = await runCliCommand(cwd, [
                        'verify',
                        '--plan-id',
                        currentPlanId,
                        '--json',
                        ...(recordVerify ? ['--record'] : []),
                        ...(requirePolicyLock ? ['--require-policy-lock'] : []),
                        ...(skipPolicyLock ? ['--skip-policy-lock'] : []),
                    ], baselineDirtyPaths.length > 0
                        ? { NEURCODE_VERIFY_IGNORE_PATHS: JSON.stringify(baselineDirtyPaths) }
                        : undefined, {
                        timeoutMs: getVerifyTimeoutMs(),
                        label: 'ship:verify',
                        streamOutput: streamStepOutput,
                    });
                    verifyTotalMs += verifyAfterTestRepair.durationMs;
                    recordRunStep(auditSteps, {
                        stage: 'verify',
                        attempt: remediationAttemptsUsed + 1,
                        run: verifyAfterTestRepair,
                        message: 'post_test_repair',
                        planId: currentPlanId,
                    });
                    const parsedAfterRepair = parseVerifyPayload(`${verifyAfterTestRepair.stdout}\n${verifyAfterTestRepair.stderr}`);
                    if (parsedAfterRepair) {
                        verifyPayload = parsedAfterRepair;
                        verifyExitCode = verifyAfterTestRepair.code;
                        persistCheckpoint((draft) => {
                            draft.stage = 'verify';
                            draft.currentPlanId = currentPlanId;
                            draft.verifyExitCode = verifyExitCode;
                            draft.verifyPayload = parsedAfterRepair;
                            draft.repairPlanIds = [...repairPlanIds];
                            draft.remediationAttemptsUsed = remediationAttemptsUsed;
                        });
                    }
                    testsAttempts += 1;
                    const finalTestRun = await runShellCommand(cwd, testCommand, {
                        timeoutMs: getTestTimeoutMs(),
                        label: 'ship:tests',
                        streamOutput: streamStepOutput,
                    });
                    testsTotalMs += finalTestRun.durationMs;
                    testsExitCode = finalTestRun.code;
                    testsPassed = finalTestRun.code === 0;
                    recordRunStep(auditSteps, {
                        stage: 'tests',
                        attempt: testsAttempts,
                        run: finalTestRun,
                        message: 'post_test_repair',
                        planId: currentPlanId,
                    });
                }
                else {
                    remediationActions.push('test_repair_plan_failed');
                }
            }
        }
    }
    else if (options.skipTests === true) {
        recordRunStep(auditSteps, {
            stage: 'tests',
            attempt: 0,
            run: null,
            message: 'skipped_by_flag',
            planId: currentPlanId,
        });
    }
    else {
        recordRunStep(auditSteps, {
            stage: 'tests',
            attempt: 0,
            run: null,
            message: 'skipped_due_to_verify_failure',
            planId: currentPlanId,
        });
    }
    persistCheckpoint((draft) => {
        draft.stage = 'tests';
        draft.currentPlanId = currentPlanId;
        draft.repairPlanIds = [...repairPlanIds];
        draft.remediationAttemptsUsed = remediationAttemptsUsed;
        draft.tests = {
            skipped: options.skipTests === true || !verifyPassedFinal,
            passed: testsPassed,
            exitCode: testsExitCode,
            attempts: testsAttempts,
            command: testCommand || null,
        };
        draft.verifyExitCode = verifyExitCode;
        draft.verifyPayload = verifyPayload;
    });
    const blast = collectBlastRadius(cwd);
    let simulatorSummary;
    const simulatorStartedMs = Date.now();
    const simulatorStartedAt = new Date(simulatorStartedMs).toISOString();
    try {
        const simulation = await (0, breakage_simulator_1.runBreakageSimulation)(cwd, {
            mode: 'working',
            maxImpacted: 80,
            maxDepth: 3,
        });
        simulatorSummary = {
            impactedFiles: simulation.summary.impactedFiles,
            predictedRegressions: simulation.summary.predictedRegressions,
            topRegressions: simulation.regressions.slice(0, 4).map((item) => ({
                id: item.id,
                title: item.title,
                severity: item.severity,
                confidence: item.confidence,
            })),
        };
        auditSteps.push({
            stage: 'simulate',
            attempt: 1,
            status: 'SUCCESS',
            startedAt: simulatorStartedAt,
            endedAt: new Date().toISOString(),
            durationMs: Date.now() - simulatorStartedMs,
            message: `impacted=${simulatorSummary.impactedFiles};predicted_regressions=${simulatorSummary.predictedRegressions}`,
        });
    }
    catch {
        simulatorSummary = undefined;
        auditSteps.push({
            stage: 'simulate',
            attempt: 1,
            status: 'FAILED',
            startedAt: simulatorStartedAt,
            endedAt: new Date().toISOString(),
            durationMs: Date.now() - simulatorStartedMs,
            message: 'simulation_failed',
        });
    }
    const riskScore = computeRiskScore(finalVerifyPayload, blast, testsPassed, remediationAttemptsUsed);
    const riskLabel = classifyRiskLabel(riskScore);
    const status = verifyPassedFinal && testsPassed ? 'READY_TO_MERGE' : 'BLOCKED';
    const branch = (() => {
        const branchResult = runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
        return branchResult.code === 0 ? branchResult.stdout.trim() : 'unknown';
    })();
    const headSha = (() => {
        const headResult = runGit(cwd, ['rev-parse', 'HEAD']);
        return headResult.code === 0 ? headResult.stdout.trim() : 'unknown';
    })();
    const card = {
        status,
        generatedAt: new Date().toISOString(),
        goal: normalizedGoal,
        repository: {
            root: cwd,
            branch,
            headSha,
        },
        plans: {
            initialPlanId,
            finalPlanId: currentPlanId,
            repairPlanIds,
        },
        verification: finalVerifyPayload,
        tests: {
            skipped: options.skipTests === true,
            command: testCommand || undefined,
            passed: testsPassed,
            attempts: testsAttempts,
            lastExitCode: testsExitCode,
        },
        remediation: {
            maxAttempts: maxFixAttempts,
            attemptsUsed: remediationAttemptsUsed,
            actions: remediationActions,
        },
        blastRadius: blast,
        risk: {
            score: riskScore,
            label: riskLabel,
            mergeConfidence: 100 - riskScore,
        },
        simulator: simulatorSummary,
        timingsMs: {
            initialPlan: initialPlanDurationMs,
            initialApply: initialApplyDurationMs,
            verifyTotal: verifyTotalMs,
            testsTotal: testsTotalMs,
            total: Date.now() - startedAt,
        },
        audit: buildAuditSnapshot(),
    };
    persistCheckpoint((draft) => {
        draft.stage = 'finalize';
        draft.currentPlanId = currentPlanId;
        draft.repairPlanIds = [...repairPlanIds];
        draft.remediationAttemptsUsed = remediationAttemptsUsed;
        draft.verifyExitCode = verifyExitCode;
        draft.verifyPayload = finalVerifyPayload;
        draft.tests = {
            skipped: options.skipTests === true || !verifyPassedFinal,
            passed: testsPassed,
            exitCode: testsExitCode,
            attempts: testsAttempts,
            command: testCommand || null,
        };
        draft.resultStatus = status;
    });
    let publishedCard = null;
    if (options.publishCard !== false) {
        const publishStartedMs = Date.now();
        const publishStartedAt = new Date(publishStartedMs).toISOString();
        try {
            const config = (0, config_1.loadConfig)();
            if (config.apiKey) {
                const client = new api_client_1.ApiClient(config);
                const repoUrl = getPrimaryGitRemoteUrl(cwd) || undefined;
                const workflowRunId = process.env.GITHUB_RUN_ID || undefined;
                const publishResponse = await client.createShipCard({
                    goal: normalizedGoal,
                    status: card.status,
                    mergeConfidence: card.risk.mergeConfidence,
                    riskScore: card.risk.score,
                    verification: {
                        verdict: card.verification.verdict,
                        grade: card.verification.grade,
                        score: card.verification.adherenceScore ?? card.verification.score,
                        violations: card.verification.violations.length,
                    },
                    repoUrl,
                    commitSha: card.repository.headSha || undefined,
                    branch: card.repository.branch || undefined,
                    workflowRunId,
                    projectId: options.projectId || config.projectId || undefined,
                    card: sanitizeCardForCloud(card),
                });
                publishedCard = publishResponse;
                auditSteps.push({
                    stage: 'publish_card',
                    attempt: 1,
                    status: 'SUCCESS',
                    startedAt: publishStartedAt,
                    endedAt: new Date().toISOString(),
                    durationMs: Date.now() - publishStartedMs,
                    message: `card_id=${publishResponse.id}`,
                });
            }
            else {
                console.log(chalk.dim('ℹ️  Merge card publish skipped (no API key found in current org scope).'));
                auditSteps.push({
                    stage: 'publish_card',
                    attempt: 1,
                    status: 'SKIPPED',
                    startedAt: publishStartedAt,
                    endedAt: new Date().toISOString(),
                    durationMs: Date.now() - publishStartedMs,
                    message: 'missing_api_key',
                });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.log(chalk.yellow(`⚠️  Merge card publish failed (non-blocking): ${message}`));
            auditSteps.push({
                stage: 'publish_card',
                attempt: 1,
                status: 'FAILED',
                startedAt: publishStartedAt,
                endedAt: new Date().toISOString(),
                durationMs: Date.now() - publishStartedMs,
                message,
            });
        }
    }
    else {
        auditSteps.push({
            stage: 'publish_card',
            attempt: 1,
            status: 'SKIPPED',
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            durationMs: 0,
            message: 'publish_disabled',
        });
    }
    card.audit = buildAuditSnapshot();
    const artifactPaths = writeMergeConfidenceArtifacts(cwd, card);
    artifactPaths.attestationPath = writeReleaseAttestation(cwd, card, artifactPaths);
    persistCheckpoint((draft) => {
        draft.status = 'completed';
        draft.stage = 'completed';
        draft.initialPlanId = initialPlanId;
        draft.currentPlanId = currentPlanId;
        draft.repairPlanIds = [...repairPlanIds];
        draft.remediationAttemptsUsed = remediationAttemptsUsed;
        draft.verifyExitCode = verifyExitCode;
        draft.verifyPayload = finalVerifyPayload;
        draft.tests = {
            skipped: options.skipTests === true || !verifyPassedFinal,
            passed: testsPassed,
            exitCode: testsExitCode,
            attempts: testsAttempts,
            command: testCommand || null,
        };
        draft.resultStatus = card.status;
        draft.artifacts = artifactPaths;
        draft.shareCard = publishedCard;
        draft.audit = card.audit;
        draft.error = null;
    });
    console.log(chalk.dim('\n4/4 Merge Confidence Card generated.'));
    console.log(chalk.dim(`   JSON: ${artifactPaths.jsonPath}`));
    console.log(chalk.dim(`   Markdown: ${artifactPaths.markdownPath}`));
    if (artifactPaths.attestationPath) {
        console.log(chalk.dim(`   Attestation: ${artifactPaths.attestationPath}`));
    }
    if (publishedCard?.shareUrl) {
        console.log(chalk.dim(`   Share URL: ${publishedCard.shareUrl}`));
    }
    console.log('');
    if (status === 'READY_TO_MERGE') {
        console.log(chalk.bold.green('✅ Ready to merge'));
        console.log(chalk.green(`   Confidence: ${card.risk.mergeConfidence}/100 | Risk: ${card.risk.label}`));
    }
    else {
        console.log(chalk.bold.red('❌ Blocked'));
        console.log(chalk.red(`   Verdict: ${finalVerifyPayload.verdict} | Tests: ${testsPassed ? 'PASS' : 'FAIL'}`));
        console.log(chalk.red(`   Confidence: ${card.risk.mergeConfidence}/100 | Risk: ${card.risk.label}`));
    }
    if (card.simulator) {
        console.log(chalk.dim(`   Simulator: impacted=${card.simulator.impactedFiles}, predicted_regressions=${card.simulator.predictedRegressions}`));
    }
    if (options.json) {
        emitShipJson({
            success: card.status === 'READY_TO_MERGE',
            status: card.status,
            finalPlanId: card.plans.finalPlanId,
            mergeConfidence: card.risk.mergeConfidence,
            riskScore: card.risk.score,
            verification: {
                verdict: card.verification.verdict,
                grade: card.verification.grade,
                score: card.verification.adherenceScore ?? card.verification.score,
                violations: card.verification.violations.length,
            },
            tests: {
                skipped: card.tests.skipped,
                passed: card.tests.passed,
            },
            simulator: card.simulator,
            artifacts: artifactPaths,
            shareCard: publishedCard,
            audit: card.audit,
        });
    }
    process.exit(status === 'READY_TO_MERGE' ? 0 : 2);
}
function emitResumeErrorJson(input) {
    const now = new Date().toISOString();
    const exitCode = input.exitCode ?? 1;
    emitShipJson({
        success: false,
        status: 'ERROR',
        finalPlanId: null,
        mergeConfidence: null,
        riskScore: null,
        artifacts: null,
        shareCard: null,
        error: {
            stage: 'resume',
            code: input.code,
            message: input.message,
            detail: input.detail,
            exitCode,
        },
        audit: {
            runId: input.runId,
            startedAt: now,
            finishedAt: now,
            durationMs: 0,
            timeoutMs: {
                plan: getPlanTimeoutMs(),
                apply: getApplyTimeoutMs(),
                verify: getVerifyTimeoutMs(),
                tests: getTestTimeoutMs(),
            },
            heartbeatMs: getHeartbeatIntervalMs(),
            steps: [],
        },
    });
}
async function shipResumeCommand(runId, options) {
    const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const normalizedRunId = String(runId || '').trim();
    if (!normalizedRunId) {
        if (options.json) {
            emitResumeErrorJson({
                runId: 'unknown',
                code: 'RUN_ID_REQUIRED',
                message: 'runId is required',
            });
        }
        else {
            console.error(chalk.red('❌ ship-resume requires a run ID.'));
            console.log(chalk.dim('Usage: neurcode ship-resume <run-id>'));
        }
        process.exit(1);
    }
    const checkpoint = loadShipCheckpoint(cwd, normalizedRunId);
    if (!checkpoint) {
        if (options.json) {
            emitResumeErrorJson({
                runId: normalizedRunId,
                code: 'CHECKPOINT_NOT_FOUND',
                message: `No ship checkpoint found for run ${normalizedRunId}`,
            });
        }
        else {
            console.error(chalk.red(`❌ No ship checkpoint found for run ${normalizedRunId}.`));
            console.log(chalk.dim('Run `neurcode ship-runs` to list resumable runs.'));
        }
        process.exit(1);
    }
    if (checkpoint.status === 'completed') {
        const completedStatus = checkpoint.resultStatus || 'BLOCKED';
        if (options.json) {
            emitShipJson({
                success: completedStatus === 'READY_TO_MERGE',
                status: completedStatus,
                finalPlanId: checkpoint.currentPlanId,
                mergeConfidence: null,
                riskScore: null,
                verification: checkpoint.verifyPayload
                    ? {
                        verdict: checkpoint.verifyPayload.verdict,
                        grade: checkpoint.verifyPayload.grade,
                        score: checkpoint.verifyPayload.adherenceScore ?? checkpoint.verifyPayload.score,
                        violations: checkpoint.verifyPayload.violations.length,
                    }
                    : undefined,
                tests: {
                    skipped: checkpoint.tests.skipped,
                    passed: checkpoint.tests.passed,
                },
                artifacts: checkpoint.artifacts,
                shareCard: checkpoint.shareCard,
                audit: checkpoint.audit || {
                    runId: checkpoint.runId,
                    startedAt: checkpoint.startedAt,
                    finishedAt: checkpoint.updatedAt,
                    durationMs: Math.max(0, Date.parse(checkpoint.updatedAt) - Date.parse(checkpoint.startedAt)),
                    timeoutMs: {
                        plan: getPlanTimeoutMs(),
                        apply: getApplyTimeoutMs(),
                        verify: getVerifyTimeoutMs(),
                        tests: getTestTimeoutMs(),
                    },
                    heartbeatMs: getHeartbeatIntervalMs(),
                    steps: [],
                },
            });
        }
        else {
            console.log(chalk.yellow(`ℹ️  Run ${normalizedRunId} is already completed (${completedStatus}).`));
            if (checkpoint.artifacts) {
                console.log(chalk.dim(`   JSON: ${checkpoint.artifacts.jsonPath}`));
                console.log(chalk.dim(`   Markdown: ${checkpoint.artifacts.markdownPath}`));
                if (checkpoint.artifacts.attestationPath) {
                    console.log(chalk.dim(`   Attestation: ${checkpoint.artifacts.attestationPath}`));
                }
            }
        }
        process.exit(completedStatus === 'READY_TO_MERGE' ? 0 : completedStatus === 'BLOCKED' ? 2 : 1);
    }
    if (!checkpoint.currentPlanId) {
        if (options.json) {
            emitResumeErrorJson({
                runId: normalizedRunId,
                code: 'CHECKPOINT_MISSING_PLAN',
                message: `Run ${normalizedRunId} has no resumable plan`,
            });
        }
        else {
            console.error(chalk.red(`❌ Run ${normalizedRunId} has no resumable plan checkpoint.`));
            console.log(chalk.dim('Start a new run with `neurcode ship "<goal>"`.'));
        }
        process.exit(1);
    }
    await shipCommand(checkpoint.goal, {
        projectId: options.projectId || checkpoint.options.projectId || undefined,
        maxFixAttempts: Number.isFinite(options.maxFixAttempts)
            ? options.maxFixAttempts
            : checkpoint.options.maxFixAttempts,
        allowDirty: true,
        skipTests: options.skipTests ?? checkpoint.options.skipTests,
        testCommand: options.testCommand || checkpoint.options.testCommand || undefined,
        record: options.record ?? checkpoint.options.record,
        requirePass: options.requirePass ?? checkpoint.options.requirePass,
        requirePolicyLock: options.requirePolicyLock ?? checkpoint.options.requirePolicyLock,
        skipPolicyLock: options.skipPolicyLock ?? checkpoint.options.skipPolicyLock,
        manualApproveHighRisk: options.manualApproveHighRisk ?? checkpoint.options.manualApproveHighRisk,
        publishCard: options.publishCard ?? checkpoint.options.publishCard,
        json: options.json === true,
        resumeRunId: checkpoint.runId,
        resumeFromPlanId: checkpoint.currentPlanId,
        resumeInitialPlanId: checkpoint.initialPlanId || checkpoint.currentPlanId,
        resumeRepairPlanIds: checkpoint.repairPlanIds,
        resumeRemediationAttempts: checkpoint.remediationAttemptsUsed,
        resumeBaselineDirtyPaths: checkpoint.baselineDirtyPaths,
        resumeStartedAtIso: checkpoint.startedAt,
    });
}
function shipRunsCommand(options) {
    const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const limitRaw = Number.isFinite(options.limit) ? Number(options.limit) : 20;
    const limit = Math.max(1, Math.min(200, Math.floor(limitRaw)));
    const runs = listShipRunSummaries(cwd).slice(0, limit);
    if (options.json) {
        console.log(JSON.stringify({ runs }, null, 2));
        return;
    }
    if (runs.length === 0) {
        console.log(chalk.yellow('\n⚠️  No ship runs found for this repository.\n'));
        console.log(chalk.dim('Start one with: neurcode ship "<goal>"\n'));
        return;
    }
    console.log(chalk.bold('\n🧭 Ship Runs\n'));
    for (const run of runs) {
        console.log(chalk.cyan(`• ${run.runId}`));
        console.log(chalk.dim(`  status=${run.status} stage=${run.stage} result=${run.resultStatus || 'n/a'}`));
        if (run.currentPlanId) {
            console.log(chalk.dim(`  plan=${run.currentPlanId}`));
        }
        console.log(chalk.dim(`  updated=${run.updatedAt}`));
        console.log(chalk.dim(`  goal=${run.goal}`));
        console.log('');
    }
    console.log(chalk.dim('Resume a run with: neurcode ship-resume <run-id>\n'));
}
function shipAttestationVerifyCommand(attestationPathInput, options) {
    const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const attestationPath = (0, path_1.resolve)(cwd, String(attestationPathInput || '').trim());
    if (!(0, fs_1.existsSync)(attestationPath)) {
        const message = `Attestation file not found: ${attestationPath}`;
        if (options.json) {
            console.log(JSON.stringify({ pass: false, message }, null, 2));
        }
        else {
            console.error(chalk.red(`❌ ${message}`));
        }
        process.exit(1);
    }
    let payload;
    try {
        payload = JSON.parse((0, fs_1.readFileSync)(attestationPath, 'utf-8'));
    }
    catch (error) {
        const message = `Failed to parse attestation JSON: ${error instanceof Error ? error.message : 'Unknown error'}`;
        if (options.json) {
            console.log(JSON.stringify({ pass: false, message }, null, 2));
        }
        else {
            console.error(chalk.red(`❌ ${message}`));
        }
        process.exit(1);
    }
    const cardPathRaw = payload?.card?.jsonPath;
    const expectedSha = payload?.card?.sha256;
    const signature = payload?.signature;
    const cardPath = typeof cardPathRaw === 'string' ? (0, path_1.resolve)(cwd, cardPathRaw) : '';
    const cardExists = cardPath ? (0, fs_1.existsSync)(cardPath) : false;
    const actualSha = cardExists && typeof expectedSha === 'string'
        ? sha256Hex((0, fs_1.readFileSync)(cardPath, 'utf-8'))
        : null;
    const digestMatched = typeof expectedSha === 'string' && actualSha === expectedSha;
    const hmacKey = options.hmacKey || process.env.NEURCODE_ATTEST_HMAC_KEY;
    let signatureVerified = null;
    let signatureMessage = null;
    if (signature && typeof signature === 'object' && typeof signature.value === 'string') {
        if (!hmacKey) {
            signatureVerified = false;
            signatureMessage = 'signature present but no HMAC key provided';
        }
        else {
            const basePayload = { ...payload };
            delete basePayload.signature;
            const expectedSignature = (0, crypto_1.createHmac)('sha256', hmacKey)
                .update(JSON.stringify(basePayload), 'utf-8')
                .digest('hex');
            signatureVerified = expectedSignature === signature.value;
            signatureMessage = signatureVerified ? null : 'signature mismatch';
        }
    }
    const pass = digestMatched && (signatureVerified === null || signatureVerified === true);
    const response = {
        pass,
        attestationPath,
        cardPath,
        cardExists,
        digest: {
            expected: typeof expectedSha === 'string' ? expectedSha : null,
            actual: actualSha,
            matched: digestMatched,
        },
        signature: {
            present: Boolean(signature && typeof signature === 'object' && typeof signature.value === 'string'),
            verified: signatureVerified,
            keyId: signature && typeof signature === 'object' && typeof signature.keyId === 'string' ? signature.keyId : null,
            message: signatureMessage,
        },
    };
    if (options.json) {
        console.log(JSON.stringify(response, null, 2));
    }
    else if (pass) {
        console.log(chalk.green('\n✅ Attestation verified.\n'));
        console.log(chalk.dim(`Attestation: ${attestationPath}`));
        console.log(chalk.dim(`Card: ${cardPath}`));
        console.log(chalk.dim(`Digest: ${response.digest.actual}\n`));
    }
    else {
        console.log(chalk.red('\n❌ Attestation verification failed.\n'));
        if (!cardExists) {
            console.log(chalk.red(`- Card file missing: ${cardPath}`));
        }
        if (!digestMatched) {
            console.log(chalk.red(`- Digest mismatch (expected=${response.digest.expected}, actual=${response.digest.actual})`));
        }
        if (response.signature.verified === false && response.signature.message) {
            console.log(chalk.red(`- Signature: ${response.signature.message}`));
        }
        console.log('');
    }
    process.exit(pass ? 0 : 1);
}
//# sourceMappingURL=ship.js.map