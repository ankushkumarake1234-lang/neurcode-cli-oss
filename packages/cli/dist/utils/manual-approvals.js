"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getManualApprovalsPath = getManualApprovalsPath;
exports.readManualApprovals = readManualApprovals;
exports.writeManualApprovals = writeManualApprovals;
exports.addManualApproval = addManualApproval;
exports.getManualApprovalsForCommit = getManualApprovalsForCommit;
exports.countDistinctApprovers = countDistinctApprovers;
const fs_1 = require("fs");
const path_1 = require("path");
const MANUAL_APPROVALS_FILE = ['.neurcode', 'manual-approvals.json'];
function normalizeText(value) {
    return value.trim();
}
function normalizeActor(value) {
    return normalizeText(value).toLowerCase();
}
function normalizeCommitSha(value) {
    return normalizeText(value).toLowerCase();
}
function randomId() {
    return Math.random().toString(36).slice(2, 10);
}
function getManualApprovalsPath(projectRoot) {
    return (0, path_1.join)(projectRoot, ...MANUAL_APPROVALS_FILE);
}
function readManualApprovals(projectRoot) {
    const path = getManualApprovalsPath(projectRoot);
    if (!(0, fs_1.existsSync)(path)) {
        return [];
    }
    try {
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.approvals)) {
            return [];
        }
        return parsed.approvals
            .filter((entry) => entry && typeof entry === 'object')
            .map((entry) => ({
            id: typeof entry.id === 'string' ? normalizeText(entry.id) : randomId(),
            commitSha: typeof entry.commitSha === 'string' ? normalizeCommitSha(entry.commitSha) : '',
            planId: typeof entry.planId === 'string' && entry.planId.trim() ? entry.planId.trim() : null,
            approver: typeof entry.approver === 'string' ? normalizeText(entry.approver) : '',
            reason: typeof entry.reason === 'string' && entry.reason.trim() ? entry.reason.trim() : null,
            approvedAt: typeof entry.approvedAt === 'string' && Number.isFinite(Date.parse(entry.approvedAt))
                ? new Date(entry.approvedAt).toISOString()
                : new Date().toISOString(),
        }))
            .filter((entry) => entry.commitSha && entry.approver)
            .sort((left, right) => left.approvedAt.localeCompare(right.approvedAt));
    }
    catch {
        return [];
    }
}
function writeManualApprovals(projectRoot, approvals) {
    const path = getManualApprovalsPath(projectRoot);
    const dir = (0, path_1.join)(projectRoot, '.neurcode');
    if (!(0, fs_1.existsSync)(dir)) {
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    }
    const normalized = approvals
        .map((entry) => ({
        id: normalizeText(entry.id),
        commitSha: normalizeCommitSha(entry.commitSha),
        planId: entry.planId ? normalizeText(entry.planId) : null,
        approver: normalizeText(entry.approver),
        reason: entry.reason ? normalizeText(entry.reason) : null,
        approvedAt: Number.isFinite(Date.parse(entry.approvedAt))
            ? new Date(entry.approvedAt).toISOString()
            : new Date().toISOString(),
    }))
        .filter((entry) => entry.id && entry.commitSha && entry.approver);
    const fileData = {
        schemaVersion: 1,
        approvals: normalized.sort((left, right) => left.approvedAt.localeCompare(right.approvedAt)),
    };
    (0, fs_1.writeFileSync)(path, `${JSON.stringify(fileData, null, 2)}\n`, 'utf-8');
    return path;
}
function addManualApproval(projectRoot, input) {
    const approvals = readManualApprovals(projectRoot);
    const next = {
        id: randomId(),
        commitSha: normalizeCommitSha(input.commitSha),
        planId: input.planId && input.planId.trim() ? input.planId.trim() : null,
        approver: normalizeText(input.approver),
        reason: input.reason && input.reason.trim() ? input.reason.trim() : null,
        approvedAt: new Date().toISOString(),
    };
    approvals.push(next);
    writeManualApprovals(projectRoot, approvals);
    return next;
}
function getManualApprovalsForCommit(projectRoot, commitSha) {
    const normalizedCommitSha = normalizeCommitSha(commitSha);
    return readManualApprovals(projectRoot).filter((entry) => entry.commitSha === normalizedCommitSha);
}
function countDistinctApprovers(entries) {
    const unique = new Set(entries.map((entry) => normalizeActor(entry.approver)).filter(Boolean));
    return unique.size;
}
//# sourceMappingURL=manual-approvals.js.map