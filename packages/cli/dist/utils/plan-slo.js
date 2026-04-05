"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlanSloLogPath = getPlanSloLogPath;
exports.getPlanEscalationGuardPath = getPlanEscalationGuardPath;
exports.prunePlanSloLog = prunePlanSloLog;
exports.appendPlanSloEvent = appendPlanSloEvent;
exports.readPlanSloEvents = readPlanSloEvents;
exports.readPlanEscalationGuardSnapshot = readPlanEscalationGuardSnapshot;
const fs_1 = require("fs");
const path_1 = require("path");
const PLAN_SLO_LOG_FILENAME = 'plan-slo.jsonl';
const ESCALATION_GUARD_FILENAME = 'asset-map-escalation-guard.json';
const DEFAULT_PLAN_SLO_LOG_MAX_EVENTS = 2000;
const DEFAULT_PLAN_SLO_LOG_MAX_DAYS = 30;
function toFiniteInteger(value, fallback) {
    if (!Number.isFinite(value))
        return fallback;
    return Math.max(0, Math.floor(value));
}
function toNullableFiniteInteger(value) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return null;
    return Math.max(0, Math.floor(value));
}
function toNullableString(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
function toNullableBoolean(value) {
    if (typeof value === 'boolean')
        return value;
    return null;
}
function parseNonNegativeInt(raw) {
    if (!raw || !raw.trim())
        return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0)
        return null;
    return Math.floor(parsed);
}
function resolvePlanSloMaxEvents() {
    const parsed = parseNonNegativeInt(process.env.NEURCODE_PLAN_SLO_LOG_MAX_EVENTS);
    return parsed === null ? DEFAULT_PLAN_SLO_LOG_MAX_EVENTS : parsed;
}
function resolvePlanSloMaxDays() {
    const parsed = parseNonNegativeInt(process.env.NEURCODE_PLAN_SLO_LOG_MAX_DAYS);
    return parsed === null ? DEFAULT_PLAN_SLO_LOG_MAX_DAYS : parsed;
}
function parseEventLine(line) {
    if (!line.trim())
        return null;
    let parsed;
    try {
        parsed = JSON.parse(line);
    }
    catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object')
        return null;
    const data = parsed;
    if (data.schemaVersion !== 1)
        return null;
    if (typeof data.timestamp !== 'string')
        return null;
    if (data.intentMode !== 'implementation' && data.intentMode !== 'analysis')
        return null;
    if (typeof data.cached !== 'boolean')
        return null;
    if (typeof data.success !== 'boolean')
        return null;
    if (typeof data.exitCode !== 'number')
        return null;
    if (typeof data.elapsedMs !== 'number')
        return null;
    if (typeof data.rssKb !== 'number')
        return null;
    const coverageLevelValue = data.coverageLevel;
    const coverageLevel = coverageLevelValue === 'high' || coverageLevelValue === 'medium' || coverageLevelValue === 'low'
        ? coverageLevelValue
        : null;
    const coverageStatusValue = data.coverageStatus;
    const coverageStatus = coverageStatusValue === 'sufficient' || coverageStatusValue === 'warning' || coverageStatusValue === 'insufficient'
        ? coverageStatusValue
        : null;
    const escalationPolicyReasonValue = data.escalationPolicyReason;
    const escalationPolicyReason = escalationPolicyReasonValue === 'enabled' ||
        escalationPolicyReasonValue === 'env_disabled' ||
        escalationPolicyReasonValue === 'canary_excluded' ||
        escalationPolicyReasonValue === 'kill_switch_cooldown'
        ? escalationPolicyReasonValue
        : null;
    return {
        schemaVersion: 1,
        timestamp: data.timestamp,
        intentMode: data.intentMode,
        cached: data.cached,
        success: data.success,
        exitCode: toFiniteInteger(data.exitCode, 0),
        elapsedMs: toFiniteInteger(data.elapsedMs, 0),
        rssKb: toFiniteInteger(data.rssKb, 0),
        coverageScore: toNullableFiniteInteger(data.coverageScore),
        coverageLevel,
        coverageStatus,
        adaptiveEscalationTriggered: data.adaptiveEscalationTriggered === true,
        adaptiveEscalationReason: toNullableString(data.adaptiveEscalationReason),
        adaptiveEscalationDeepenedFiles: toFiniteInteger(typeof data.adaptiveEscalationDeepenedFiles === 'number' ? data.adaptiveEscalationDeepenedFiles : 0, 0),
        escalationPolicyEnabled: toNullableBoolean(data.escalationPolicyEnabled),
        escalationPolicyReason,
        escalationCanaryPercent: toNullableFiniteInteger(data.escalationCanaryPercent),
        escalationCanaryBucket: toNullableFiniteInteger(data.escalationCanaryBucket),
        escalationKillSwitchTripped: data.escalationKillSwitchTripped === true,
        escalationKillSwitchCooldownUntil: toNullableString(data.escalationKillSwitchCooldownUntil),
        fileTreeCount: toNullableFiniteInteger(data.fileTreeCount),
        filesUsedForGeneration: toNullableFiniteInteger(data.filesUsedForGeneration),
    };
}
function getPlanSloLogPath(projectRoot) {
    return (0, path_1.join)(projectRoot, '.neurcode', PLAN_SLO_LOG_FILENAME);
}
function getPlanEscalationGuardPath(projectRoot) {
    return (0, path_1.join)(projectRoot, '.neurcode', ESCALATION_GUARD_FILENAME);
}
function prunePlanSloLog(projectRoot, nowMs = Date.now()) {
    const maxEvents = resolvePlanSloMaxEvents();
    const maxDays = resolvePlanSloMaxDays();
    if (maxEvents === 0 && maxDays === 0) {
        return;
    }
    const sloPath = getPlanSloLogPath(projectRoot);
    if (!(0, fs_1.existsSync)(sloPath)) {
        return;
    }
    let raw;
    try {
        raw = (0, fs_1.readFileSync)(sloPath, 'utf-8');
    }
    catch {
        return;
    }
    if (!raw.trim()) {
        return;
    }
    const cutoffMs = maxDays > 0 ? nowMs - maxDays * 24 * 60 * 60 * 1000 : null;
    const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
    const retained = [];
    let changed = false;
    for (const line of lines) {
        const parsed = parseEventLine(line);
        if (!parsed) {
            changed = true;
            continue;
        }
        if (cutoffMs !== null) {
            const timestampMs = Date.parse(parsed.timestamp);
            if (Number.isFinite(timestampMs) && timestampMs < cutoffMs) {
                changed = true;
                continue;
            }
        }
        retained.push(JSON.stringify(parsed));
    }
    if (maxEvents > 0 && retained.length > maxEvents) {
        retained.splice(0, retained.length - maxEvents);
        changed = true;
    }
    if (!changed && retained.length === lines.length) {
        return;
    }
    const nextContent = retained.length > 0 ? `${retained.join('\n')}\n` : '';
    (0, fs_1.writeFileSync)(sloPath, nextContent, 'utf-8');
}
function appendPlanSloEvent(projectRoot, input) {
    const event = {
        schemaVersion: 1,
        timestamp: input.timestamp || new Date().toISOString(),
        intentMode: input.intentMode,
        cached: input.cached === true,
        success: input.success === true,
        exitCode: toFiniteInteger(input.exitCode, 1),
        elapsedMs: toFiniteInteger(input.elapsedMs, 0),
        rssKb: toFiniteInteger(input.rssKb, 0),
        coverageScore: toNullableFiniteInteger(input.coverageScore),
        coverageLevel: input.coverageLevel || null,
        coverageStatus: input.coverageStatus || null,
        adaptiveEscalationTriggered: input.adaptiveEscalationTriggered === true,
        adaptiveEscalationReason: input.adaptiveEscalationReason || null,
        adaptiveEscalationDeepenedFiles: toFiniteInteger(input.adaptiveEscalationDeepenedFiles || 0, 0),
        escalationPolicyEnabled: typeof input.escalationPolicyEnabled === 'boolean' ? input.escalationPolicyEnabled : null,
        escalationPolicyReason: input.escalationPolicyReason || null,
        escalationCanaryPercent: toNullableFiniteInteger(input.escalationCanaryPercent),
        escalationCanaryBucket: toNullableFiniteInteger(input.escalationCanaryBucket),
        escalationKillSwitchTripped: input.escalationKillSwitchTripped === true,
        escalationKillSwitchCooldownUntil: input.escalationKillSwitchCooldownUntil || null,
        fileTreeCount: toNullableFiniteInteger(input.fileTreeCount),
        filesUsedForGeneration: toNullableFiniteInteger(input.filesUsedForGeneration),
    };
    const sloPath = getPlanSloLogPath(projectRoot);
    const sloDir = (0, path_1.join)(projectRoot, '.neurcode');
    if (!(0, fs_1.existsSync)(sloDir)) {
        (0, fs_1.mkdirSync)(sloDir, { recursive: true });
    }
    (0, fs_1.appendFileSync)(sloPath, JSON.stringify(event) + '\n', 'utf-8');
    prunePlanSloLog(projectRoot);
    return event;
}
function readPlanSloEvents(projectRoot) {
    const pathValue = getPlanSloLogPath(projectRoot);
    if (!(0, fs_1.existsSync)(pathValue)) {
        return [];
    }
    try {
        const raw = (0, fs_1.readFileSync)(pathValue, 'utf-8');
        const lines = raw.split('\n');
        const events = [];
        for (const line of lines) {
            const parsed = parseEventLine(line);
            if (parsed) {
                events.push(parsed);
            }
        }
        return events;
    }
    catch {
        return [];
    }
}
function readPlanEscalationGuardSnapshot(projectRoot, nowMs = Date.now()) {
    const pathValue = getPlanEscalationGuardPath(projectRoot);
    if (!(0, fs_1.existsSync)(pathValue)) {
        return {
            path: pathValue,
            present: false,
            cooldownActive: false,
            cooldownUntil: null,
            state: null,
        };
    }
    try {
        const raw = JSON.parse((0, fs_1.readFileSync)(pathValue, 'utf-8'));
        const state = {
            version: 1,
            updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
            consecutiveBreaches: typeof raw.consecutiveBreaches === 'number' && Number.isFinite(raw.consecutiveBreaches) && raw.consecutiveBreaches > 0
                ? Math.floor(raw.consecutiveBreaches)
                : 0,
            lastBreachAt: typeof raw.lastBreachAt === 'string' ? raw.lastBreachAt : undefined,
            lastReason: typeof raw.lastReason === 'string' ? raw.lastReason : undefined,
            cooldownUntil: typeof raw.cooldownUntil === 'string' ? raw.cooldownUntil : undefined,
        };
        const cooldownUntilMs = state.cooldownUntil ? Date.parse(state.cooldownUntil) : NaN;
        const cooldownActive = Number.isFinite(cooldownUntilMs) && cooldownUntilMs > nowMs;
        return {
            path: pathValue,
            present: true,
            cooldownActive,
            cooldownUntil: state.cooldownUntil || null,
            state,
        };
    }
    catch {
        return {
            path: pathValue,
            present: false,
            cooldownActive: false,
            cooldownUntil: null,
            state: null,
        };
    }
}
//# sourceMappingURL=plan-slo.js.map