"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPolicyExceptionsPath = getPolicyExceptionsPath;
exports.readPolicyExceptions = readPolicyExceptions;
exports.writePolicyExceptions = writePolicyExceptions;
exports.listPolicyExceptions = listPolicyExceptions;
exports.addPolicyException = addPolicyException;
exports.approvePolicyException = approvePolicyException;
exports.revokePolicyException = revokePolicyException;
exports.pruneExpiredPolicyExceptions = pruneExpiredPolicyExceptions;
exports.applyPolicyExceptions = applyPolicyExceptions;
const fs_1 = require("fs");
const path_1 = require("path");
const policy_governance_1 = require("./policy-governance");
const POLICY_EXCEPTIONS_FILENAME = 'neurcode.policy.exceptions.json';
const LEGACY_POLICY_EXCEPTIONS_RELATIVE_PATH = ['.neurcode', 'policies', 'policy-exceptions.json'];
function normalizePath(value) {
    return value.replace(/\\/g, '/').trim();
}
function normalizeActor(actor) {
    return actor.trim().toLowerCase();
}
function normalizeActorList(input) {
    return Array.from(new Set(input.map((item) => normalizeActor(item)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}
function toRegexFromPattern(pattern) {
    const normalized = pattern.trim();
    if (normalized.length === 0 || normalized === '*') {
        return /^.*$/i;
    }
    if (normalized.startsWith('/') && normalized.endsWith('/') && normalized.length > 2) {
        try {
            return new RegExp(normalized.slice(1, -1), 'i');
        }
        catch {
            // Fall through to wildcard handling.
        }
    }
    const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const wildcard = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${wildcard}$`, 'i');
}
function isFutureIso(value) {
    const time = Date.parse(value);
    return Number.isFinite(time) && time > Date.now();
}
function getLegacyPolicyExceptionsPath(cwd) {
    return (0, path_1.join)(cwd, ...LEGACY_POLICY_EXCEPTIONS_RELATIVE_PATH);
}
function normalizeApprovals(value) {
    if (!Array.isArray(value))
        return [];
    const approvals = value
        .filter((item) => !!item && typeof item === 'object')
        .map((item) => {
        const approver = typeof item.approver === 'string' ? item.approver.trim() : '';
        if (!approver)
            return null;
        return {
            approver,
            approvedAt: typeof item.approvedAt === 'string' && Number.isFinite(Date.parse(item.approvedAt))
                ? new Date(item.approvedAt).toISOString()
                : new Date().toISOString(),
            comment: typeof item.comment === 'string' && item.comment.trim() ? item.comment.trim() : null,
        };
    })
        .filter((item) => item !== null)
        .sort((left, right) => left.approvedAt.localeCompare(right.approvedAt));
    // Keep only latest approval per normalized approver.
    const latestByApprover = new Map();
    for (const approval of approvals) {
        latestByApprover.set(normalizeActor(approval.approver), approval);
    }
    return Array.from(latestByApprover.values()).sort((a, b) => a.approvedAt.localeCompare(b.approvedAt));
}
function evaluatePolicyExceptionEligibility(entry, options, rule) {
    if (!entry.active || !isFutureIso(entry.expiresAt)) {
        return {
            usable: false,
            reason: 'expired_or_inactive',
            effectiveApprovalCount: 0,
            requiredApprovals: 0,
            critical: false,
        };
    }
    if (options.requireReason) {
        const reasonLength = (entry.reason || '').trim().length;
        if (reasonLength < options.minReasonLength) {
            return {
                usable: false,
                reason: 'reason_required',
                effectiveApprovalCount: 0,
                requiredApprovals: 0,
                critical: false,
            };
        }
    }
    if (Number.isFinite(options.maxExpiryDays) && options.maxExpiryDays > 0) {
        const createdMs = Date.parse(entry.createdAt);
        const expiryMs = Date.parse(entry.expiresAt);
        if (Number.isFinite(createdMs) && Number.isFinite(expiryMs) && expiryMs > createdMs) {
            const windowMs = options.maxExpiryDays * 24 * 60 * 60 * 1000;
            if (expiryMs - createdMs > windowMs) {
                return {
                    usable: false,
                    reason: 'duration_exceeds_max',
                    effectiveApprovalCount: 0,
                    requiredApprovals: 0,
                    critical: false,
                };
            }
        }
    }
    const requiredApprovalResolution = (0, policy_governance_1.resolveRequiredApprovalsForRule)(rule, {
        schemaVersion: 2,
        exceptionApprovals: {
            required: options.requireApproval,
            minApprovals: options.minApprovals,
            disallowSelfApproval: options.disallowSelfApproval,
            allowedApprovers: options.allowedApprovers,
            requireReason: options.requireReason,
            minReasonLength: options.minReasonLength,
            maxExpiryDays: options.maxExpiryDays,
            criticalRulePatterns: options.criticalRulePatterns,
            criticalMinApprovals: options.criticalMinApprovals,
        },
        audit: {
            requireIntegrity: false,
        },
    });
    const requiredApprovals = requiredApprovalResolution.requiredApprovals;
    const critical = requiredApprovalResolution.critical;
    if (!options.requireApproval) {
        return {
            usable: true,
            reason: 'eligible',
            effectiveApprovalCount: 0,
            requiredApprovals,
            critical,
        };
    }
    const allowedApprovers = normalizeActorList(options.allowedApprovers || []);
    const requestedBy = normalizeActor(entry.requestedBy || entry.createdBy || '');
    const acceptedApprovals = entry.approvals.filter((approval) => {
        const actor = normalizeActor(approval.approver);
        if (!actor)
            return false;
        if (allowedApprovers.length > 0 && !allowedApprovers.includes(actor))
            return false;
        if (options.disallowSelfApproval && requestedBy && actor === requestedBy)
            return false;
        return true;
    });
    const effectiveApprovalCount = acceptedApprovals.length;
    if (effectiveApprovalCount >= requiredApprovals) {
        return {
            usable: true,
            reason: 'eligible',
            effectiveApprovalCount,
            requiredApprovals,
            critical,
        };
    }
    if (entry.approvals.length === 0) {
        return {
            usable: false,
            reason: 'approval_required',
            effectiveApprovalCount,
            requiredApprovals,
            critical,
        };
    }
    if (options.disallowSelfApproval && entry.approvals.length > 0 && acceptedApprovals.length === 0) {
        const onlySelf = entry.approvals.every((approval) => normalizeActor(approval.approver) === requestedBy);
        if (onlySelf) {
            return {
                usable: false,
                reason: 'self_approval_only',
                effectiveApprovalCount,
                requiredApprovals,
                critical,
            };
        }
    }
    if (allowedApprovers.length > 0 && acceptedApprovals.length === 0) {
        return {
            usable: false,
            reason: 'approver_not_allowed',
            effectiveApprovalCount,
            requiredApprovals,
            critical,
        };
    }
    if (critical && entry.approvals.length > 0) {
        return {
            usable: false,
            reason: 'critical_approvals_required',
            effectiveApprovalCount,
            requiredApprovals,
            critical,
        };
    }
    return {
        usable: false,
        reason: 'insufficient_approvals',
        effectiveApprovalCount,
        requiredApprovals,
        critical,
    };
}
function getPolicyExceptionsPath(cwd) {
    return (0, path_1.join)(cwd, POLICY_EXCEPTIONS_FILENAME);
}
function resolvePolicyExceptionsReadPath(cwd) {
    const canonicalPath = getPolicyExceptionsPath(cwd);
    if ((0, fs_1.existsSync)(canonicalPath)) {
        return canonicalPath;
    }
    const legacyPath = getLegacyPolicyExceptionsPath(cwd);
    return (0, fs_1.existsSync)(legacyPath) ? legacyPath : canonicalPath;
}
function readPolicyExceptions(cwd) {
    const path = resolvePolicyExceptionsReadPath(cwd);
    if (!(0, fs_1.existsSync)(path)) {
        return [];
    }
    try {
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.exceptions)) {
            return [];
        }
        return parsed.exceptions
            .filter((entry) => {
            if (!entry || typeof entry !== 'object')
                return false;
            return (typeof entry.id === 'string' &&
                typeof entry.rulePattern === 'string' &&
                typeof entry.filePattern === 'string' &&
                typeof entry.reason === 'string' &&
                typeof entry.expiresAt === 'string');
        })
            .map((entry) => ({
            ...entry,
            ticket: typeof entry.ticket === 'string' && entry.ticket.trim() ? entry.ticket : null,
            createdBy: typeof entry.createdBy === 'string' && entry.createdBy.trim() ? entry.createdBy : 'unknown',
            requestedBy: typeof entry.requestedBy === 'string' && entry.requestedBy.trim()
                ? entry.requestedBy.trim()
                : typeof entry.createdBy === 'string' && entry.createdBy.trim()
                    ? entry.createdBy.trim()
                    : 'unknown',
            createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date(0).toISOString(),
            active: entry.active !== false,
            severity: entry.severity === 'allow' || entry.severity === 'warn' || entry.severity === 'block'
                ? entry.severity
                : null,
            approvals: normalizeApprovals(entry.approvals),
        }))
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    }
    catch {
        return [];
    }
}
function writePolicyExceptions(cwd, entries) {
    const path = getPolicyExceptionsPath(cwd);
    const payload = {
        schemaVersion: 1,
        exceptions: entries,
    };
    (0, fs_1.writeFileSync)(path, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
    return path;
}
function listPolicyExceptions(cwd) {
    const all = readPolicyExceptions(cwd);
    const active = all.filter((entry) => entry.active && isFutureIso(entry.expiresAt));
    const expired = all.filter((entry) => !entry.active || !isFutureIso(entry.expiresAt));
    return { all, active, expired };
}
function addPolicyException(cwd, input) {
    const rulePattern = input.rulePattern.trim();
    const filePattern = normalizePath(input.filePattern || '*');
    const reason = input.reason.trim();
    const expiresAt = input.expiresAt.trim();
    const expiresMs = Date.parse(expiresAt);
    if (!rulePattern) {
        throw new Error('rulePattern is required');
    }
    if (!filePattern) {
        throw new Error('filePattern is required');
    }
    if (!reason) {
        throw new Error('reason is required');
    }
    if (!Number.isFinite(expiresMs)) {
        throw new Error('expiresAt must be a valid ISO datetime');
    }
    if (expiresMs <= Date.now()) {
        throw new Error('expiresAt must be in the future');
    }
    const entries = readPolicyExceptions(cwd);
    const nowIso = new Date().toISOString();
    const actor = input.createdBy && input.createdBy.trim() ? input.createdBy.trim() : 'unknown';
    const requestedBy = input.requestedBy && input.requestedBy.trim() ? input.requestedBy.trim() : actor;
    const exception = {
        id: `px_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        rulePattern,
        filePattern,
        reason,
        ticket: input.ticket && input.ticket.trim() ? input.ticket.trim() : null,
        createdAt: nowIso,
        createdBy: actor,
        requestedBy,
        expiresAt: new Date(expiresMs).toISOString(),
        severity: input.severity || null,
        active: true,
        approvals: [],
    };
    entries.unshift(exception);
    writePolicyExceptions(cwd, entries);
    return exception;
}
function approvePolicyException(cwd, id, input) {
    const approver = input.approver.trim();
    if (!approver) {
        throw new Error('approver is required');
    }
    const entries = readPolicyExceptions(cwd);
    let updated = null;
    const next = entries.map((entry) => {
        if (entry.id !== id) {
            return entry;
        }
        if (!entry.active) {
            updated = entry;
            return entry;
        }
        const approvals = [...entry.approvals];
        const key = normalizeActor(approver);
        const existingIndex = approvals.findIndex((item) => normalizeActor(item.approver) === key);
        const nextApproval = {
            approver,
            approvedAt: new Date().toISOString(),
            comment: input.comment && input.comment.trim() ? input.comment.trim() : null,
        };
        if (existingIndex >= 0) {
            approvals[existingIndex] = nextApproval;
        }
        else {
            approvals.push(nextApproval);
        }
        const normalized = {
            ...entry,
            approvals: approvals.sort((a, b) => a.approvedAt.localeCompare(b.approvedAt)),
        };
        updated = normalized;
        return normalized;
    });
    if (updated) {
        writePolicyExceptions(cwd, next);
    }
    return updated;
}
function revokePolicyException(cwd, id) {
    const entries = readPolicyExceptions(cwd);
    let changed = false;
    const next = entries.map((entry) => {
        if (entry.id === id && entry.active) {
            changed = true;
            return {
                ...entry,
                active: false,
            };
        }
        return entry;
    });
    if (changed) {
        writePolicyExceptions(cwd, next);
    }
    return changed;
}
function pruneExpiredPolicyExceptions(cwd) {
    const entries = readPolicyExceptions(cwd);
    const now = Date.now();
    const next = entries.filter((entry) => entry.active && Date.parse(entry.expiresAt) > now);
    const removed = entries.length - next.length;
    if (removed > 0 || entries.length === 0) {
        writePolicyExceptions(cwd, next);
    }
    return {
        removed,
        remaining: next.length,
    };
}
function applyPolicyExceptions(violations, exceptions, options) {
    const applyOptions = {
        requireApproval: options?.requireApproval === true,
        minApprovals: Number.isFinite(options?.minApprovals)
            ? Math.max(1, Math.floor(Number(options?.minApprovals)))
            : 1,
        disallowSelfApproval: options?.disallowSelfApproval !== false,
        allowedApprovers: Array.isArray(options?.allowedApprovers) ? options.allowedApprovers : [],
        requireReason: options?.requireReason !== false,
        minReasonLength: Number.isFinite(options?.minReasonLength)
            ? Math.max(8, Math.floor(Number(options?.minReasonLength)))
            : 12,
        maxExpiryDays: Number.isFinite(options?.maxExpiryDays)
            ? Math.max(1, Math.floor(Number(options?.maxExpiryDays)))
            : 30,
        criticalRulePatterns: Array.isArray(options?.criticalRulePatterns) ? options.criticalRulePatterns : [],
        criticalMinApprovals: Number.isFinite(options?.criticalMinApprovals)
            ? Math.max(2, Math.floor(Number(options?.criticalMinApprovals)))
            : 2,
    };
    const activeExceptions = exceptions.filter((entry) => entry.active && isFutureIso(entry.expiresAt));
    const usableExceptions = activeExceptions.filter((entry) => evaluatePolicyExceptionEligibility(entry, applyOptions, entry.rulePattern).usable);
    const suppressedViolations = [];
    const blockedViolations = [];
    const remainingViolations = [];
    const matchedExceptionIds = new Set();
    const exceptionMatchers = activeExceptions.map((entry) => ({
        entry,
        ruleRegex: toRegexFromPattern(entry.rulePattern),
        fileRegex: toRegexFromPattern(normalizePath(entry.filePattern || '*')),
    }));
    for (const violation of violations) {
        const violationRule = String(violation.rule || '').trim();
        const violationFile = normalizePath(String(violation.file || ''));
        const violationSeverity = String(violation.severity || '').toLowerCase();
        const candidates = exceptionMatchers.filter((matcher) => {
            const severityAllowed = !matcher.entry.severity || matcher.entry.severity.toLowerCase() === violationSeverity;
            return severityAllowed && matcher.ruleRegex.test(violationRule) && matcher.fileRegex.test(violationFile);
        });
        if (candidates.length === 0) {
            remainingViolations.push(violation);
            continue;
        }
        const evaluatedCandidates = candidates.map((candidate) => ({
            ...candidate,
            eligibility: evaluatePolicyExceptionEligibility(candidate.entry, applyOptions, violationRule),
        }));
        const usable = evaluatedCandidates.find((candidate) => candidate.eligibility.usable);
        if (usable) {
            matchedExceptionIds.add(usable.entry.id);
            suppressedViolations.push({
                ...violation,
                exceptionId: usable.entry.id,
                reason: usable.entry.reason,
                expiresAt: usable.entry.expiresAt,
            });
            continue;
        }
        const blocked = evaluatedCandidates[0];
        const blockedReason = blocked.eligibility.reason === 'eligible'
            ? 'insufficient_approvals'
            : blocked.eligibility.reason;
        matchedExceptionIds.add(blocked.entry.id);
        blockedViolations.push({
            ...violation,
            exceptionId: blocked.entry.id,
            eligibilityReason: blockedReason,
            requiredApprovals: blocked.eligibility.requiredApprovals,
            effectiveApprovals: blocked.eligibility.effectiveApprovalCount,
            critical: blocked.eligibility.critical,
        });
        remainingViolations.push(violation);
    }
    return {
        remainingViolations,
        suppressedViolations,
        blockedViolations,
        matchedExceptionIds: Array.from(matchedExceptionIds),
        activeExceptions,
        usableExceptions,
    };
}
//# sourceMappingURL=policy-exceptions.js.map