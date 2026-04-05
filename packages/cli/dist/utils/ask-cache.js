"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAskCachePath = getAskCachePath;
exports.computeAskQuestionHash = computeAskQuestionHash;
exports.computeAskCacheKey = computeAskCacheKey;
exports.readCachedAsk = readCachedAsk;
exports.writeCachedAsk = writeCachedAsk;
exports.findNearCachedAsk = findNearCachedAsk;
exports.getChangedWorkingTreePaths = getChangedWorkingTreePaths;
exports.listCachedAsks = listCachedAsks;
exports.deleteCachedAsks = deleteCachedAsks;
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const plan_cache_1 = require("./plan-cache");
const secret_masking_1 = require("./secret-masking");
const ASK_CACHE_SCHEMA_VERSION = 3;
const ASK_CACHE_FILE = 'ask-cache.json';
const MAX_ENTRIES = 700;
const NON_SEMANTIC_GIT_PATH_MARKERS = [
    '.neurcode/',
    '.gitignore',
];
function nowIso() {
    return new Date().toISOString();
}
function sha256Hex(input) {
    return (0, crypto_1.createHash)('sha256').update(input).digest('hex');
}
function getCachePath(cwd) {
    return (0, path_1.join)(cwd, '.neurcode', ASK_CACHE_FILE);
}
function getAskCachePath(cwd) {
    return getCachePath(cwd);
}
function ensureNeurcodeDir(cwd) {
    const dir = (0, path_1.join)(cwd, '.neurcode');
    if (!(0, fs_1.existsSync)(dir)) {
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    }
}
function readStore(cwd) {
    const path = getCachePath(cwd);
    if (!(0, fs_1.existsSync)(path)) {
        return { schemaVersion: ASK_CACHE_SCHEMA_VERSION, entries: {} };
    }
    try {
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.schemaVersion !== ASK_CACHE_SCHEMA_VERSION || !parsed.entries || typeof parsed.entries !== 'object') {
            throw new Error('invalid ask cache schema');
        }
        return parsed;
    }
    catch {
        try {
            (0, fs_1.renameSync)(path, path.replace(/\.json$/, `.corrupt-${Date.now()}.json`));
        }
        catch {
            // ignore
        }
        return { schemaVersion: ASK_CACHE_SCHEMA_VERSION, entries: {} };
    }
}
function writeStore(cwd, store) {
    ensureNeurcodeDir(cwd);
    const path = getCachePath(cwd);
    const tmp = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    (0, fs_1.writeFileSync)(tmp, JSON.stringify(store, null, 2) + '\n', 'utf-8');
    (0, fs_1.renameSync)(tmp, path);
}
function pruneStore(store) {
    const entries = Object.values(store.entries);
    if (entries.length <= MAX_ENTRIES)
        return;
    entries.sort((a, b) => {
        const aTime = Date.parse(a.lastUsedAt || a.createdAt) || 0;
        const bTime = Date.parse(b.lastUsedAt || b.createdAt) || 0;
        return aTime - bTime;
    });
    const deleteCount = entries.length - MAX_ENTRIES;
    for (const entry of entries.slice(0, deleteCount)) {
        delete store.entries[entry.key];
    }
}
function normalizeRepoIdentity(raw) {
    return (raw || '').trim().toLowerCase().replace(/\\/g, '/');
}
function normalizePath(raw) {
    return (raw || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
}
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 3);
}
function jaccard(a, b) {
    if (a.size === 0 || b.size === 0)
        return 0;
    let inter = 0;
    for (const token of a) {
        if (b.has(token))
            inter++;
    }
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
}
function tokenOverlap(a, b) {
    if (a.size === 0 || b.size === 0)
        return 0;
    let inter = 0;
    for (const token of a) {
        if (b.has(token))
            inter++;
    }
    return inter / Math.max(1, Math.min(a.size, b.size));
}
function buildTrigrams(input) {
    const normalized = input
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized)
        return new Set();
    if (normalized.length < 3)
        return new Set([normalized]);
    const grams = new Set();
    for (let i = 0; i <= normalized.length - 3; i++) {
        grams.add(normalized.slice(i, i + 3));
    }
    return grams;
}
function diceCoefficient(a, b) {
    if (a.size === 0 || b.size === 0)
        return 0;
    let inter = 0;
    for (const gram of a) {
        if (b.has(gram))
            inter++;
    }
    return (2 * inter) / (a.size + b.size);
}
function questionSimilarity(aQuestion, bQuestion) {
    const aNorm = (0, plan_cache_1.normalizeIntent)(aQuestion);
    const bNorm = (0, plan_cache_1.normalizeIntent)(bQuestion);
    if (!aNorm || !bNorm)
        return 0;
    const aTokens = new Set(tokenize(aNorm));
    const bTokens = new Set(tokenize(bNorm));
    const jac = jaccard(aTokens, bTokens);
    const overlap = tokenOverlap(aTokens, bTokens);
    const dice = diceCoefficient(buildTrigrams(aNorm), buildTrigrams(bNorm));
    return jac * 0.45 + overlap * 0.35 + dice * 0.2;
}
function sameSnapshot(current, cached) {
    if (current.kind !== cached.kind)
        return false;
    if (normalizeRepoIdentity(current.repoIdentity) !== normalizeRepoIdentity(cached.repoIdentity))
        return false;
    if (current.kind === 'git' && cached.kind === 'git') {
        return current.headTreeSha === cached.headTreeSha;
    }
    if (current.kind === 'filesystem' && cached.kind === 'filesystem') {
        return current.fileTreeHash === cached.fileTreeHash;
    }
    return false;
}
function pathOverlaps(aRaw, bRaw) {
    const a = normalizePath(aRaw);
    const b = normalizePath(bRaw);
    if (!a || !b)
        return false;
    if (a === b)
        return true;
    return a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}
function canUseWithSafeDrift(input, candidate) {
    const currentRepo = input.repo;
    const cachedRepo = candidate.input.repo;
    if (currentRepo.kind !== 'git' || cachedRepo.kind !== 'git')
        return false;
    if (normalizeRepoIdentity(currentRepo.repoIdentity) !== normalizeRepoIdentity(cachedRepo.repoIdentity))
        return false;
    const changedPaths = (input.changedPaths || []).map(normalizePath).filter(Boolean);
    const evidencePaths = (candidate.evidencePaths || []).map(normalizePath).filter(Boolean);
    if (changedPaths.length === 0 || evidencePaths.length === 0)
        return false;
    for (const changed of changedPaths) {
        for (const evidence of evidencePaths) {
            if (pathOverlaps(changed, evidence)) {
                return false;
            }
        }
    }
    return true;
}
function computeAskQuestionHash(input) {
    const normalized = (0, plan_cache_1.normalizeIntent)(input.question);
    const safeQuestion = (0, secret_masking_1.maskSecretsInText)(normalized).masked;
    const payload = [
        `question=${safeQuestion}`,
        `contextHash=${input.contextHash || ''}`,
    ].join('\n');
    return sha256Hex(payload);
}
function computeAskCacheKey(input) {
    const repoPart = input.repo.kind === 'git'
        ? `kind=git\nrepoIdentity=${input.repo.repoIdentity}\nheadSha=${input.repo.headSha}\nheadTreeSha=${input.repo.headTreeSha}\nworkingTreeHash=${input.repo.workingTreeHash}`
        : `kind=filesystem\nrepoIdentity=${input.repo.repoIdentity}\nfileTreeHash=${input.repo.fileTreeHash}`;
    const payload = [
        `schema=${input.schemaVersion}`,
        `orgId=${input.orgId}`,
        `projectId=${input.projectId}`,
        repoPart,
        `questionHash=${input.questionHash}`,
        `policyVersionHash=${input.policyVersionHash}`,
        `neurcodeVersion=${input.neurcodeVersion}`,
    ].join('\n');
    return sha256Hex(payload);
}
function readCachedAsk(cwd, key) {
    try {
        const store = readStore(cwd);
        const existing = store.entries[key];
        if (!existing)
            return null;
        const next = {
            ...existing,
            lastUsedAt: nowIso(),
            useCount: Number(existing.useCount || 0) + 1,
        };
        store.entries[key] = next;
        writeStore(cwd, store);
        return next;
    }
    catch {
        return null;
    }
}
function writeCachedAsk(cwd, entry) {
    try {
        const store = readStore(cwd);
        const existing = store.entries[entry.key];
        const now = nowIso();
        const questionNorm = (0, plan_cache_1.normalizeIntent)(entry.input.question || '');
        const safeQuestion = (0, secret_masking_1.maskSecretsInText)(questionNorm).masked;
        const questionHash = sha256Hex(safeQuestion);
        const next = {
            key: entry.key,
            createdAt: existing?.createdAt || now,
            lastUsedAt: now,
            useCount: Number(existing?.useCount || 0) + 1,
            input: {
                ...entry.input,
                schemaVersion: ASK_CACHE_SCHEMA_VERSION,
                question: safeQuestion,
                questionHash,
            },
            output: {
                ...entry.output,
                question: (0, secret_masking_1.maskSecretsInText)(entry.output.question).masked,
                questionNormalized: safeQuestion,
                citations: entry.output.citations.map((citation) => ({
                    ...citation,
                    snippet: (0, secret_masking_1.maskSecretsInText)(citation.snippet).masked,
                })),
            },
            evidencePaths: [...new Set((entry.evidencePaths || []).map(normalizePath).filter(Boolean))].slice(0, 80),
        };
        store.entries[entry.key] = next;
        pruneStore(store);
        writeStore(cwd, store);
    }
    catch {
        // ignore cache write failures
    }
}
function listScopeEntries(cwd, scope) {
    const store = readStore(cwd);
    return Object.values(store.entries).filter((entry) => entry.input.orgId === scope.orgId && entry.input.projectId === scope.projectId);
}
function findNearCachedAsk(cwd, input) {
    try {
        const normalizedQuestion = (0, plan_cache_1.normalizeIntent)(input.question);
        if (!normalizedQuestion)
            return null;
        const thresholdBase = Math.max(0.6, Math.min(input.minSimilarity ?? 0.72, 0.98));
        const tokenCount = new Set(tokenize(normalizedQuestion)).size;
        const threshold = tokenCount <= 4
            ? Math.max(thresholdBase, 0.8)
            : tokenCount <= 8
                ? Math.max(thresholdBase, 0.72)
                : thresholdBase;
        const candidates = listScopeEntries(cwd, {
            orgId: input.orgId,
            projectId: input.projectId,
        });
        let best = null;
        for (const candidate of candidates) {
            if (!candidate.input.question)
                continue;
            if (normalizeRepoIdentity(candidate.input.repo.repoIdentity) !== normalizeRepoIdentity(input.repo.repoIdentity))
                continue;
            if (candidate.input.policyVersionHash !== input.policyVersionHash)
                continue;
            if (candidate.input.neurcodeVersion !== input.neurcodeVersion)
                continue;
            if (input.contextHash && candidate.input.contextHash && input.contextHash !== candidate.input.contextHash)
                continue;
            const snapshotMatch = sameSnapshot(input.repo, candidate.input.repo);
            const driftSafe = snapshotMatch ? false : canUseWithSafeDrift(input, candidate);
            if (!snapshotMatch && !driftSafe)
                continue;
            const score = questionSimilarity(normalizedQuestion, candidate.input.question);
            if (score < threshold)
                continue;
            const next = {
                entry: candidate,
                similarity: score,
                reason: snapshotMatch ? 'same_snapshot_similar_question' : 'safe_repo_drift_similar_question',
            };
            if (!best) {
                best = next;
                continue;
            }
            if (next.similarity > best.similarity) {
                best = next;
                continue;
            }
            if (next.similarity === best.similarity) {
                const bestTime = Date.parse(best.entry.lastUsedAt || best.entry.createdAt) || 0;
                const nextTime = Date.parse(next.entry.lastUsedAt || next.entry.createdAt) || 0;
                if (nextTime > bestTime)
                    best = next;
            }
        }
        return best;
    }
    catch {
        return null;
    }
}
function sanitizeGitStatus(status) {
    const lines = status.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const filtered = [];
    for (const line of lines) {
        if (NON_SEMANTIC_GIT_PATH_MARKERS.some((marker) => line.includes(marker))) {
            continue;
        }
        if (line.length < 4)
            continue;
        const pathPart = line.slice(3).trim();
        if (!pathPart)
            continue;
        const normalizedRaw = pathPart.includes(' -> ')
            ? pathPart.split(' -> ').pop() || pathPart
            : pathPart;
        const unquoted = normalizedRaw.startsWith('"') && normalizedRaw.endsWith('"')
            ? normalizedRaw.slice(1, -1).replace(/\\"/g, '"')
            : normalizedRaw;
        filtered.push(normalizePath(unquoted));
    }
    return filtered;
}
function getChangedWorkingTreePaths(cwd, limit = 140) {
    try {
        const inside = (0, child_process_1.execSync)('git rev-parse --is-inside-work-tree', {
            cwd,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim().toLowerCase();
        if (inside !== 'true')
            return [];
        const status = (0, child_process_1.execSync)('git status --porcelain', {
            cwd,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        return sanitizeGitStatus(status).slice(0, Math.max(1, limit));
    }
    catch {
        return [];
    }
}
function listCachedAsks(cwd) {
    try {
        const store = readStore(cwd);
        return Object.values(store.entries).sort((a, b) => {
            const aTime = Date.parse(a.lastUsedAt || a.createdAt) || 0;
            const bTime = Date.parse(b.lastUsedAt || b.createdAt) || 0;
            return bTime - aTime;
        });
    }
    catch {
        return [];
    }
}
function deleteCachedAsks(cwd, predicate) {
    try {
        const store = readStore(cwd);
        let deleted = 0;
        for (const [key, entry] of Object.entries(store.entries)) {
            if (!predicate(entry))
                continue;
            delete store.entries[key];
            deleted++;
        }
        if (deleted > 0) {
            writeStore(cwd, store);
        }
        return {
            deleted,
            remaining: Object.keys(store.entries).length,
        };
    }
    catch {
        return { deleted: 0, remaining: 0 };
    }
}
//# sourceMappingURL=ask-cache.js.map