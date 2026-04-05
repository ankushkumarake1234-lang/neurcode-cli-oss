"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPolicyAuditPath = getPolicyAuditPath;
exports.readPolicyAuditEvents = readPolicyAuditEvents;
exports.appendPolicyAuditEvent = appendPolicyAuditEvent;
exports.verifyPolicyAuditIntegrity = verifyPolicyAuditIntegrity;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const POLICY_AUDIT_FILENAME = 'neurcode.policy.audit.log.jsonl';
const LEGACY_POLICY_AUDIT_RELATIVE_PATH = ['.neurcode', 'policies', 'policy-audit.log.jsonl'];
function sha256Hex(input) {
    return (0, crypto_1.createHash)('sha256').update(input, 'utf-8').digest('hex');
}
function getLegacyPolicyAuditPath(cwd) {
    return (0, path_1.join)(cwd, ...LEGACY_POLICY_AUDIT_RELATIVE_PATH);
}
function getPolicyAuditPath(cwd) {
    return (0, path_1.join)(cwd, POLICY_AUDIT_FILENAME);
}
function resolvePolicyAuditReadPath(cwd) {
    const canonicalPath = getPolicyAuditPath(cwd);
    if ((0, fs_1.existsSync)(canonicalPath)) {
        return canonicalPath;
    }
    const legacyPath = getLegacyPolicyAuditPath(cwd);
    return (0, fs_1.existsSync)(legacyPath) ? legacyPath : canonicalPath;
}
function migrateLegacyAuditLogIfNeeded(cwd) {
    const canonicalPath = getPolicyAuditPath(cwd);
    if ((0, fs_1.existsSync)(canonicalPath)) {
        return;
    }
    const legacyPath = getLegacyPolicyAuditPath(cwd);
    if (!(0, fs_1.existsSync)(legacyPath)) {
        return;
    }
    try {
        const legacyContent = (0, fs_1.readFileSync)(legacyPath, 'utf-8');
        if (legacyContent.trim().length > 0) {
            (0, fs_1.writeFileSync)(canonicalPath, legacyContent.trimEnd() + '\n', 'utf-8');
        }
    }
    catch {
        // Keep legacy-only mode if migration fails.
    }
}
function canonicalizeForHash(value) {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => canonicalizeForHash(item));
    }
    const record = value;
    const out = {};
    for (const key of Object.keys(record).sort()) {
        if (key === 'hash')
            continue;
        out[key] = canonicalizeForHash(record[key]);
    }
    return out;
}
function computeEventHash(eventWithoutHash) {
    return sha256Hex(JSON.stringify(canonicalizeForHash(eventWithoutHash)));
}
function readPolicyAuditEvents(cwd) {
    const path = resolvePolicyAuditReadPath(cwd);
    if (!(0, fs_1.existsSync)(path)) {
        return [];
    }
    try {
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
        const events = [];
        for (const line of lines) {
            const parsed = JSON.parse(line);
            if (parsed &&
                parsed.schemaVersion === 1 &&
                typeof parsed.timestamp === 'string' &&
                typeof parsed.actor === 'string' &&
                typeof parsed.action === 'string' &&
                typeof parsed.entityType === 'string' &&
                typeof parsed.hash === 'string') {
                events.push({
                    schemaVersion: 1,
                    timestamp: parsed.timestamp,
                    actor: parsed.actor,
                    action: parsed.action,
                    entityType: parsed.entityType,
                    entityId: typeof parsed.entityId === 'string' ? parsed.entityId : null,
                    metadata: parsed.metadata && typeof parsed.metadata === 'object'
                        ? parsed.metadata
                        : {},
                    prevHash: typeof parsed.prevHash === 'string' ? parsed.prevHash : null,
                    hash: parsed.hash,
                });
            }
        }
        return events;
    }
    catch {
        return [];
    }
}
function appendPolicyAuditEvent(cwd, input) {
    migrateLegacyAuditLogIfNeeded(cwd);
    const path = getPolicyAuditPath(cwd);
    const existing = readPolicyAuditEvents(cwd);
    const prevHash = existing.length > 0 ? existing[existing.length - 1].hash : null;
    const base = {
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
        actor: input.actor.trim() || 'unknown',
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId || null,
        metadata: input.metadata || {},
        prevHash,
    };
    const event = {
        ...base,
        hash: computeEventHash(base),
    };
    const line = JSON.stringify(event);
    let prefix = '';
    if ((0, fs_1.existsSync)(path)) {
        const existing = (0, fs_1.readFileSync)(path, 'utf-8').trimEnd();
        if (existing.length > 0) {
            prefix = `${existing}\n`;
        }
    }
    (0, fs_1.writeFileSync)(path, prefix + line + '\n', 'utf-8');
    return event;
}
function verifyPolicyAuditIntegrity(cwd) {
    const path = resolvePolicyAuditReadPath(cwd);
    const events = [];
    const issues = [];
    if ((0, fs_1.existsSync)(path)) {
        try {
            const raw = (0, fs_1.readFileSync)(path, 'utf-8');
            const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
            for (let i = 0; i < lines.length; i += 1) {
                try {
                    const parsed = JSON.parse(lines[i]);
                    if (!parsed ||
                        parsed.schemaVersion !== 1 ||
                        typeof parsed.timestamp !== 'string' ||
                        typeof parsed.actor !== 'string' ||
                        typeof parsed.action !== 'string' ||
                        typeof parsed.entityType !== 'string' ||
                        typeof parsed.hash !== 'string') {
                        issues.push(`event[${i}] schema/shape invalid`);
                        continue;
                    }
                    events.push({
                        schemaVersion: 1,
                        timestamp: parsed.timestamp,
                        actor: parsed.actor,
                        action: parsed.action,
                        entityType: parsed.entityType,
                        entityId: typeof parsed.entityId === 'string' ? parsed.entityId : null,
                        metadata: parsed.metadata && typeof parsed.metadata === 'object'
                            ? parsed.metadata
                            : {},
                        prevHash: typeof parsed.prevHash === 'string' ? parsed.prevHash : null,
                        hash: parsed.hash,
                    });
                }
                catch {
                    issues.push(`event[${i}] is not valid JSON`);
                }
            }
        }
        catch {
            issues.push('audit log is unreadable');
        }
    }
    let prevHash = null;
    for (let i = 0; i < events.length; i += 1) {
        const event = events[i];
        if (event.prevHash !== prevHash) {
            issues.push(`event[${i}] prevHash mismatch`);
        }
        const expectedHash = computeEventHash({
            schemaVersion: event.schemaVersion,
            timestamp: event.timestamp,
            actor: event.actor,
            action: event.action,
            entityType: event.entityType,
            entityId: event.entityId,
            metadata: event.metadata,
            prevHash: event.prevHash,
        });
        if (expectedHash !== event.hash) {
            issues.push(`event[${i}] hash mismatch`);
        }
        prevHash = event.hash;
    }
    return {
        valid: issues.length === 0,
        count: events.length,
        lastHash: events.length > 0 ? events[events.length - 1].hash : null,
        issues,
    };
}
//# sourceMappingURL=policy-audit.js.map