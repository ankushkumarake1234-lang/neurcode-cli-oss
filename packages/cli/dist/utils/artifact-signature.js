"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSigningKeyRing = parseSigningKeyRing;
exports.resolveGovernanceArtifactSigningConfigFromEnv = resolveGovernanceArtifactSigningConfigFromEnv;
exports.computeGovernanceArtifactPayloadHash = computeGovernanceArtifactPayloadHash;
exports.signGovernanceArtifact = signGovernanceArtifact;
exports.verifyGovernanceArtifactSignature = verifyGovernanceArtifactSignature;
const crypto_1 = require("crypto");
function normalizeForHash(value) {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((entry) => normalizeForHash(entry));
    }
    const record = value;
    const out = {};
    for (const key of Object.keys(record).sort((left, right) => left.localeCompare(right))) {
        out[key] = normalizeForHash(record[key]);
    }
    return out;
}
function stableJson(value) {
    return JSON.stringify(normalizeForHash(value));
}
function sha256Hex(input) {
    return (0, crypto_1.createHash)('sha256').update(input, 'utf-8').digest('hex');
}
function hmacSha256Hex(input, key) {
    return (0, crypto_1.createHmac)('sha256', key).update(input, 'utf-8').digest('hex');
}
function stripTopLevelSignature(artifact) {
    const clone = { ...artifact };
    delete clone.signature;
    return clone;
}
function parseSignatureEnvelope(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const record = value;
    const algorithm = record.algorithm;
    const keyIdRaw = record.keyId;
    const signedAt = record.signedAt;
    const payloadHash = record.payloadHash;
    const signatureValue = record.value;
    if (algorithm !== 'hmac-sha256') {
        return null;
    }
    if (typeof signedAt !== 'string' || !signedAt.trim()) {
        return null;
    }
    if (typeof payloadHash !== 'string' || !payloadHash.trim()) {
        return null;
    }
    if (typeof signatureValue !== 'string' || !signatureValue.trim()) {
        return null;
    }
    return {
        algorithm: 'hmac-sha256',
        keyId: typeof keyIdRaw === 'string' && keyIdRaw.trim() ? keyIdRaw.trim() : null,
        signedAt: signedAt.trim(),
        payloadHash: payloadHash.trim(),
        value: signatureValue.trim(),
    };
}
function dedupeCandidates(candidates) {
    const seen = new Set();
    const out = [];
    for (const candidate of candidates) {
        const marker = `${candidate.keyId || ''}:${candidate.key}`;
        if (seen.has(marker))
            continue;
        seen.add(marker);
        out.push(candidate);
    }
    return out;
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
function resolveGovernanceArtifactSigningConfigFromEnv() {
    const signingKeys = parseSigningKeyRing(process.env.NEURCODE_GOVERNANCE_SIGNING_KEYS);
    const singleSigningKey = process.env.NEURCODE_GOVERNANCE_SIGNING_KEY?.trim() ||
        process.env.NEURCODE_AI_LOG_SIGNING_KEY?.trim() ||
        '';
    let signingKeyId = process.env.NEURCODE_GOVERNANCE_SIGNING_KEY_ID?.trim() || null;
    if (singleSigningKey) {
        return {
            signingKey: singleSigningKey,
            signingKeyId,
            signingKeys,
        };
    }
    if (Object.keys(signingKeys).length === 0) {
        return {
            signingKey: null,
            signingKeyId,
            signingKeys,
        };
    }
    if (!signingKeyId || !signingKeys[signingKeyId]) {
        signingKeyId = Object.keys(signingKeys).sort((left, right) => left.localeCompare(right))[0];
    }
    return {
        signingKey: signingKeys[signingKeyId] || null,
        signingKeyId,
        signingKeys,
    };
}
function computeGovernanceArtifactPayloadHash(artifact) {
    return sha256Hex(stableJson(artifact));
}
function signGovernanceArtifact(artifact, config) {
    const baseArtifact = stripTopLevelSignature(artifact);
    if (!config.signingKey) {
        return baseArtifact;
    }
    const payloadHash = computeGovernanceArtifactPayloadHash(baseArtifact);
    const signature = {
        algorithm: 'hmac-sha256',
        keyId: config.signingKeyId || null,
        signedAt: new Date().toISOString(),
        payloadHash,
        value: hmacSha256Hex(payloadHash, config.signingKey),
    };
    return {
        ...baseArtifact,
        signature,
    };
}
function verifyGovernanceArtifactSignature(input) {
    const signature = parseSignatureEnvelope(input.artifact.signature);
    if (!signature) {
        return {
            present: false,
            signed: false,
            valid: input.requireSigned ? false : true,
            required: input.requireSigned,
            keyId: null,
            verifiedWithKeyId: null,
            payloadHash: null,
            issues: input.requireSigned ? ['artifact signature missing or invalid'] : [],
        };
    }
    const issues = [];
    const baseArtifact = stripTopLevelSignature(input.artifact);
    const expectedPayloadHash = computeGovernanceArtifactPayloadHash(baseArtifact);
    if (expectedPayloadHash !== signature.payloadHash) {
        issues.push('artifact payload hash mismatch');
    }
    const keyCandidates = [];
    if (signature.keyId) {
        const fromRing = input.signingKeys[signature.keyId];
        if (fromRing) {
            keyCandidates.push({ key: fromRing, keyId: signature.keyId });
        }
        else if (input.signingKey && (!input.signingKeyId || input.signingKeyId === signature.keyId)) {
            keyCandidates.push({ key: input.signingKey, keyId: signature.keyId });
        }
        else {
            issues.push(`unknown signing key id: ${signature.keyId}`);
        }
    }
    else {
        if (input.signingKey) {
            keyCandidates.push({ key: input.signingKey, keyId: input.signingKeyId || null });
        }
        for (const [keyId, key] of Object.entries(input.signingKeys)) {
            keyCandidates.push({ key, keyId });
        }
    }
    const candidates = dedupeCandidates(keyCandidates);
    if (candidates.length === 0) {
        issues.push(signature.keyId
            ? `signing key is missing for key id: ${signature.keyId}`
            : 'signing key is missing, cannot verify artifact signature');
        return {
            present: true,
            signed: true,
            valid: false,
            required: input.requireSigned,
            keyId: signature.keyId,
            verifiedWithKeyId: null,
            payloadHash: signature.payloadHash,
            issues,
        };
    }
    let verifiedWithKeyId = null;
    const expectedSignatureByKey = candidates.map((candidate) => ({
        keyId: candidate.keyId,
        value: hmacSha256Hex(expectedPayloadHash, candidate.key),
    }));
    const matched = expectedSignatureByKey.find((candidate) => candidate.value === signature.value);
    if (matched) {
        verifiedWithKeyId = matched.keyId || null;
    }
    else {
        issues.push('artifact signature mismatch');
    }
    return {
        present: true,
        signed: true,
        valid: issues.length === 0,
        required: input.requireSigned,
        keyId: signature.keyId,
        verifiedWithKeyId,
        payloadHash: signature.payloadHash,
        issues,
    };
}
//# sourceMappingURL=artifact-signature.js.map