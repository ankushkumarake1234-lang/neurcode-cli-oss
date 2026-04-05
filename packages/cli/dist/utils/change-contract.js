"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChangeContract = createChangeContract;
exports.resolveChangeContractPath = resolveChangeContractPath;
exports.writeChangeContract = writeChangeContract;
exports.readChangeContract = readChangeContract;
exports.evaluateChangeContract = evaluateChangeContract;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
function normalizeRepoPath(value) {
    return value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
function uniqueSorted(values) {
    const set = new Set();
    for (const value of values) {
        const normalized = normalizeRepoPath(value);
        if (!normalized)
            continue;
        set.add(normalized);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
}
function sha256Hex(input) {
    return (0, crypto_1.createHash)('sha256').update(input, 'utf-8').digest('hex');
}
function fingerprintFiles(expectedFiles) {
    return sha256Hex(JSON.stringify(uniqueSorted(expectedFiles)));
}
function isChangeContract(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const record = value;
    const basicShape = (record.schemaVersion === 1 &&
        typeof record.generatedAt === 'string' &&
        typeof record.contractId === 'string' &&
        typeof record.planId === 'string' &&
        Array.isArray(record.expectedFiles) &&
        typeof record.expectedFilesFingerprint === 'string');
    if (!basicShape) {
        return false;
    }
    if (record.signature === undefined) {
        return true;
    }
    if (!record.signature || typeof record.signature !== 'object' || Array.isArray(record.signature)) {
        return false;
    }
    const signature = record.signature;
    if (signature.algorithm !== 'hmac-sha256' ||
        typeof signature.signedAt !== 'string' ||
        typeof signature.payloadHash !== 'string' ||
        typeof signature.value !== 'string') {
        return false;
    }
    if (signature.keyId !== null && signature.keyId !== undefined && typeof signature.keyId !== 'string') {
        return false;
    }
    return true;
}
function createChangeContract(input) {
    const expectedFiles = uniqueSorted(input.expectedFiles);
    const generatedAt = input.generatedAt || new Date().toISOString();
    const intentHash = sha256Hex(input.intent || '');
    const expectedFilesFingerprint = fingerprintFiles(expectedFiles);
    const contractId = sha256Hex(JSON.stringify({
        generatedAt,
        planId: input.planId,
        sessionId: input.sessionId || null,
        projectId: input.projectId || null,
        intentHash,
        expectedFilesFingerprint,
        policyLockFingerprint: input.policyLockFingerprint || null,
        compiledPolicyFingerprint: input.compiledPolicyFingerprint || null,
    }));
    return {
        schemaVersion: 1,
        generatedAt,
        contractId,
        planId: input.planId,
        sessionId: input.sessionId || null,
        projectId: input.projectId || null,
        intentHash,
        expectedFiles,
        expectedFilesFingerprint,
        policyLockFingerprint: input.policyLockFingerprint || null,
        compiledPolicyFingerprint: input.compiledPolicyFingerprint || null,
    };
}
function resolveChangeContractPath(projectRoot, inputPath) {
    const target = inputPath && inputPath.trim().length > 0 ? inputPath.trim() : '.neurcode/change-contract.json';
    return (0, path_1.resolve)(projectRoot, target);
}
function writeChangeContract(projectRoot, contract, outputPath) {
    const path = resolveChangeContractPath(projectRoot, outputPath);
    const dir = (0, path_1.dirname)(path);
    if (!(0, fs_1.existsSync)(dir)) {
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    }
    (0, fs_1.writeFileSync)(path, `${JSON.stringify(contract, null, 2)}\n`, 'utf-8');
    return path;
}
function readChangeContract(projectRoot, inputPath) {
    const path = resolveChangeContractPath(projectRoot, inputPath);
    if (!(0, fs_1.existsSync)(path)) {
        return { path, exists: false, contract: null };
    }
    try {
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!isChangeContract(parsed)) {
            return { path, exists: true, contract: null, error: 'Invalid change contract schema' };
        }
        return { path, exists: true, contract: parsed };
    }
    catch (error) {
        return {
            path,
            exists: true,
            contract: null,
            error: error instanceof Error ? error.message : 'Failed to parse change contract',
        };
    }
}
function evaluateChangeContract(contract, input) {
    const violations = [];
    if (contract.planId !== input.planId) {
        violations.push({
            code: 'CHANGE_CONTRACT_PLAN_MISMATCH',
            message: `Change contract plan mismatch (expected ${contract.planId}, got ${input.planId})`,
            expected: contract.planId,
            actual: input.planId,
        });
    }
    if (contract.policyLockFingerprint &&
        input.policyLockFingerprint &&
        contract.policyLockFingerprint !== input.policyLockFingerprint) {
        violations.push({
            code: 'CHANGE_CONTRACT_POLICY_LOCK_MISMATCH',
            message: 'Policy lock fingerprint does not match change contract',
            expected: contract.policyLockFingerprint,
            actual: input.policyLockFingerprint,
        });
    }
    if (contract.compiledPolicyFingerprint &&
        input.compiledPolicyFingerprint &&
        contract.compiledPolicyFingerprint !== input.compiledPolicyFingerprint) {
        violations.push({
            code: 'CHANGE_CONTRACT_COMPILED_POLICY_MISMATCH',
            message: 'Compiled policy fingerprint does not match change contract',
            expected: contract.compiledPolicyFingerprint,
            actual: input.compiledPolicyFingerprint,
        });
    }
    const expectedSet = new Set(uniqueSorted(contract.expectedFiles));
    const normalizedChanged = uniqueSorted(input.changedFiles);
    for (const path of normalizedChanged) {
        if (!expectedSet.has(path)) {
            violations.push({
                code: 'CHANGE_CONTRACT_UNEXPECTED_FILE',
                message: `File changed outside change contract: ${path}`,
                file: path,
            });
        }
    }
    const outOfContractFiles = violations.filter((violation) => violation.code === 'CHANGE_CONTRACT_UNEXPECTED_FILE').length;
    return {
        valid: violations.length === 0,
        violations,
        coverage: {
            expectedFiles: expectedSet.size,
            changedFiles: normalizedChanged.length,
            outOfContractFiles,
        },
    };
}
//# sourceMappingURL=change-contract.js.map