"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCriticalRuleMatch = isCriticalRuleMatch;
exports.resolveRequiredApprovalsForRule = resolveRequiredApprovalsForRule;
exports.defaultPolicyGovernanceConfig = defaultPolicyGovernanceConfig;
exports.getPolicyGovernancePath = getPolicyGovernancePath;
exports.readPolicyGovernanceConfig = readPolicyGovernanceConfig;
exports.writePolicyGovernanceConfig = writePolicyGovernanceConfig;
exports.mergePolicyGovernanceWithOrgOverrides = mergePolicyGovernanceWithOrgOverrides;
exports.updatePolicyGovernanceConfig = updatePolicyGovernanceConfig;
const fs_1 = require("fs");
const path_1 = require("path");
const POLICY_GOVERNANCE_FILENAME = 'neurcode.policy.governance.json';
const LEGACY_POLICY_GOVERNANCE_RELATIVE_PATH = ['.neurcode', 'policies', 'policy-governance.json'];
function getLegacyPolicyGovernancePath(cwd) {
    return (0, path_1.join)(cwd, ...LEGACY_POLICY_GOVERNANCE_RELATIVE_PATH);
}
function normalizeApprovers(values) {
    return Array.from(new Set(values
        .map((item) => item.trim())
        .filter(Boolean))).sort((left, right) => left.localeCompare(right));
}
function normalizeRulePatterns(values) {
    return Array.from(new Set(values
        .map((item) => item.trim())
        .filter(Boolean))).sort((left, right) => left.localeCompare(right));
}
function normalizePolicyGovernanceConfigObject(config) {
    return {
        schemaVersion: 2,
        exceptionApprovals: {
            required: config.exceptionApprovals.required === true,
            minApprovals: Math.max(1, Math.min(5, Math.floor(config.exceptionApprovals.minApprovals || 1))),
            disallowSelfApproval: config.exceptionApprovals.disallowSelfApproval !== false,
            allowedApprovers: normalizeApprovers(config.exceptionApprovals.allowedApprovers || []),
            requireReason: config.exceptionApprovals.requireReason !== false,
            minReasonLength: Math.max(8, Math.min(500, Math.floor(config.exceptionApprovals.minReasonLength || 12))),
            maxExpiryDays: Math.max(1, Math.min(365, Math.floor(config.exceptionApprovals.maxExpiryDays || 30))),
            criticalRulePatterns: normalizeRulePatterns(config.exceptionApprovals.criticalRulePatterns || []),
            criticalMinApprovals: Math.max(2, Math.min(5, Math.floor(config.exceptionApprovals.criticalMinApprovals || 2))),
        },
        audit: {
            requireIntegrity: config.audit.requireIntegrity === true,
        },
    };
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
function isCriticalRuleMatch(rule, criticalRulePatterns) {
    const target = rule.trim();
    if (!target)
        return false;
    return normalizeRulePatterns(criticalRulePatterns).some((pattern) => toRegexFromPattern(pattern).test(target));
}
function resolveRequiredApprovalsForRule(rule, config) {
    const base = Math.max(1, config.exceptionApprovals.minApprovals);
    const critical = isCriticalRuleMatch(rule, config.exceptionApprovals.criticalRulePatterns);
    if (!critical) {
        return { requiredApprovals: base, critical: false };
    }
    return {
        requiredApprovals: Math.max(base, config.exceptionApprovals.criticalMinApprovals),
        critical: true,
    };
}
function defaultPolicyGovernanceConfig() {
    return {
        schemaVersion: 2,
        exceptionApprovals: {
            required: false,
            minApprovals: 1,
            disallowSelfApproval: true,
            allowedApprovers: [],
            requireReason: true,
            minReasonLength: 12,
            maxExpiryDays: 30,
            criticalRulePatterns: [
                'sensitive-file-default',
                'secret_*',
                'policy_audit_integrity',
                'ai_change_log_signing_required',
            ],
            criticalMinApprovals: 2,
        },
        audit: {
            requireIntegrity: false,
        },
    };
}
function getPolicyGovernancePath(cwd) {
    return (0, path_1.join)(cwd, POLICY_GOVERNANCE_FILENAME);
}
function resolvePolicyGovernanceReadPath(cwd) {
    const canonicalPath = getPolicyGovernancePath(cwd);
    if ((0, fs_1.existsSync)(canonicalPath)) {
        return canonicalPath;
    }
    const legacyPath = getLegacyPolicyGovernancePath(cwd);
    return (0, fs_1.existsSync)(legacyPath) ? legacyPath : canonicalPath;
}
function readPolicyGovernanceConfig(cwd) {
    const path = resolvePolicyGovernanceReadPath(cwd);
    if (!(0, fs_1.existsSync)(path)) {
        return defaultPolicyGovernanceConfig();
    }
    try {
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        const parsed = JSON.parse(raw);
        const defaults = defaultPolicyGovernanceConfig();
        const required = parsed.exceptionApprovals?.required === true;
        const minApprovalsRaw = parsed.exceptionApprovals?.minApprovals;
        const minApprovals = Number.isFinite(minApprovalsRaw)
            ? Math.max(1, Math.min(5, Math.floor(Number(minApprovalsRaw))))
            : defaults.exceptionApprovals.minApprovals;
        const disallowSelfApproval = parsed.exceptionApprovals?.disallowSelfApproval !== false;
        const allowedApprovers = Array.isArray(parsed.exceptionApprovals?.allowedApprovers)
            ? normalizeApprovers(parsed.exceptionApprovals.allowedApprovers
                .filter((item) => typeof item === 'string'))
            : defaults.exceptionApprovals.allowedApprovers;
        const requireIntegrity = parsed.audit?.requireIntegrity === true;
        const requireReason = parsed.exceptionApprovals?.requireReason !== false;
        const minReasonLengthRaw = parsed.exceptionApprovals?.minReasonLength;
        const minReasonLength = Number.isFinite(minReasonLengthRaw)
            ? Math.max(8, Math.min(500, Math.floor(Number(minReasonLengthRaw))))
            : defaults.exceptionApprovals.minReasonLength;
        const maxExpiryDaysRaw = parsed.exceptionApprovals?.maxExpiryDays;
        const maxExpiryDays = Number.isFinite(maxExpiryDaysRaw)
            ? Math.max(1, Math.min(365, Math.floor(Number(maxExpiryDaysRaw))))
            : defaults.exceptionApprovals.maxExpiryDays;
        const criticalRulePatterns = Array.isArray(parsed.exceptionApprovals?.criticalRulePatterns)
            ? normalizeRulePatterns(parsed.exceptionApprovals.criticalRulePatterns
                .filter((item) => typeof item === 'string'))
            : defaults.exceptionApprovals.criticalRulePatterns;
        const criticalMinApprovalsRaw = parsed.exceptionApprovals?.criticalMinApprovals;
        const criticalMinApprovals = Number.isFinite(criticalMinApprovalsRaw)
            ? Math.max(2, Math.min(5, Math.floor(Number(criticalMinApprovalsRaw))))
            : defaults.exceptionApprovals.criticalMinApprovals;
        return {
            schemaVersion: 2,
            exceptionApprovals: {
                required,
                minApprovals,
                disallowSelfApproval,
                allowedApprovers,
                requireReason,
                minReasonLength,
                maxExpiryDays,
                criticalRulePatterns,
                criticalMinApprovals,
            },
            audit: {
                requireIntegrity,
            },
        };
    }
    catch {
        return defaultPolicyGovernanceConfig();
    }
}
function writePolicyGovernanceConfig(cwd, config) {
    const normalized = normalizePolicyGovernanceConfigObject(config);
    const path = getPolicyGovernancePath(cwd);
    (0, fs_1.writeFileSync)(path, JSON.stringify(normalized, null, 2) + '\n', 'utf-8');
    return path;
}
function mergePolicyGovernanceWithOrgOverrides(localConfig, orgOverride) {
    const local = normalizePolicyGovernanceConfigObject(localConfig);
    if (!orgOverride || typeof orgOverride !== 'object') {
        return local;
    }
    const orgException = orgOverride.exceptionApprovals || {};
    const orgAudit = orgOverride.audit || {};
    const orgMinApprovals = Number.isFinite(orgException.minApprovals)
        ? Math.max(1, Math.min(5, Math.floor(Number(orgException.minApprovals))))
        : null;
    const orgMinReasonLength = Number.isFinite(orgException.minReasonLength)
        ? Math.max(8, Math.min(500, Math.floor(Number(orgException.minReasonLength))))
        : null;
    const orgMaxExpiryDays = Number.isFinite(orgException.maxExpiryDays)
        ? Math.max(1, Math.min(365, Math.floor(Number(orgException.maxExpiryDays))))
        : null;
    const orgCriticalMinApprovals = Number.isFinite(orgException.criticalMinApprovals)
        ? Math.max(2, Math.min(5, Math.floor(Number(orgException.criticalMinApprovals))))
        : null;
    const localAllowedApprovers = normalizeApprovers(local.exceptionApprovals.allowedApprovers);
    const orgAllowedApproversProvided = Array.isArray(orgException.allowedApprovers);
    const orgAllowedApprovers = orgAllowedApproversProvided
        ? normalizeApprovers(orgException.allowedApprovers || [])
        : [];
    const effectiveAllowedApprovers = (() => {
        if (!orgAllowedApproversProvided || orgAllowedApprovers.length === 0) {
            return localAllowedApprovers;
        }
        if (localAllowedApprovers.length === 0) {
            return orgAllowedApprovers;
        }
        const allowedSet = new Set(orgAllowedApprovers);
        const intersection = localAllowedApprovers.filter((entry) => allowedSet.has(entry));
        return intersection.length > 0 ? intersection : orgAllowedApprovers;
    })();
    const orgCriticalPatterns = Array.isArray(orgException.criticalRulePatterns)
        ? normalizeRulePatterns(orgException.criticalRulePatterns || [])
        : [];
    return normalizePolicyGovernanceConfigObject({
        schemaVersion: 2,
        exceptionApprovals: {
            required: local.exceptionApprovals.required || orgException.required === true,
            minApprovals: orgMinApprovals == null
                ? local.exceptionApprovals.minApprovals
                : Math.max(local.exceptionApprovals.minApprovals, orgMinApprovals),
            disallowSelfApproval: local.exceptionApprovals.disallowSelfApproval || orgException.disallowSelfApproval === true,
            allowedApprovers: effectiveAllowedApprovers,
            requireReason: local.exceptionApprovals.requireReason || orgException.requireReason === true,
            minReasonLength: orgMinReasonLength == null
                ? local.exceptionApprovals.minReasonLength
                : Math.max(local.exceptionApprovals.minReasonLength, orgMinReasonLength),
            maxExpiryDays: orgMaxExpiryDays == null
                ? local.exceptionApprovals.maxExpiryDays
                : Math.min(local.exceptionApprovals.maxExpiryDays, orgMaxExpiryDays),
            criticalRulePatterns: normalizeRulePatterns([
                ...local.exceptionApprovals.criticalRulePatterns,
                ...orgCriticalPatterns,
            ]),
            criticalMinApprovals: orgCriticalMinApprovals == null
                ? local.exceptionApprovals.criticalMinApprovals
                : Math.max(local.exceptionApprovals.criticalMinApprovals, orgCriticalMinApprovals),
        },
        audit: {
            requireIntegrity: local.audit.requireIntegrity || orgAudit.requireIntegrity === true,
        },
    });
}
function updatePolicyGovernanceConfig(cwd, input) {
    const current = readPolicyGovernanceConfig(cwd);
    const next = {
        schemaVersion: 2,
        exceptionApprovals: {
            required: typeof input.required === 'boolean' ? input.required : current.exceptionApprovals.required,
            minApprovals: Number.isFinite(input.minApprovals)
                ? Math.max(1, Math.min(5, Math.floor(Number(input.minApprovals))))
                : current.exceptionApprovals.minApprovals,
            disallowSelfApproval: typeof input.disallowSelfApproval === 'boolean'
                ? input.disallowSelfApproval
                : current.exceptionApprovals.disallowSelfApproval,
            allowedApprovers: Array.isArray(input.allowedApprovers)
                ? normalizeApprovers(input.allowedApprovers)
                : current.exceptionApprovals.allowedApprovers,
            requireReason: typeof input.requireReason === 'boolean'
                ? input.requireReason
                : current.exceptionApprovals.requireReason,
            minReasonLength: Number.isFinite(input.minReasonLength)
                ? Math.max(8, Math.min(500, Math.floor(Number(input.minReasonLength))))
                : current.exceptionApprovals.minReasonLength,
            maxExpiryDays: Number.isFinite(input.maxExpiryDays)
                ? Math.max(1, Math.min(365, Math.floor(Number(input.maxExpiryDays))))
                : current.exceptionApprovals.maxExpiryDays,
            criticalRulePatterns: Array.isArray(input.criticalRulePatterns)
                ? normalizeRulePatterns(input.criticalRulePatterns)
                : current.exceptionApprovals.criticalRulePatterns,
            criticalMinApprovals: Number.isFinite(input.criticalMinApprovals)
                ? Math.max(2, Math.min(5, Math.floor(Number(input.criticalMinApprovals))))
                : current.exceptionApprovals.criticalMinApprovals,
        },
        audit: {
            requireIntegrity: typeof input.requireAuditIntegrity === 'boolean'
                ? input.requireAuditIntegrity
                : current.audit.requireIntegrity,
        },
    };
    writePolicyGovernanceConfig(cwd, next);
    return next;
}
//# sourceMappingURL=policy-governance.js.map