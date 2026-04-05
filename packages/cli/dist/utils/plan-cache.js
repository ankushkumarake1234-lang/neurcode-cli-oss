"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeIntent = normalizeIntent;
exports.getRepoIdentity = getRepoIdentity;
exports.getGitRepoFingerprint = getGitRepoFingerprint;
exports.getFilesystemFingerprintFromTree = getFilesystemFingerprintFromTree;
exports.computePromptHash = computePromptHash;
exports.computePolicyVersionHash = computePolicyVersionHash;
exports.getNeurcodeVersion = getNeurcodeVersion;
exports.computePlanCacheKey = computePlanCacheKey;
exports.getBrainDbPath = getBrainDbPath;
exports.getBrainPointerPath = getBrainPointerPath;
exports.getBrainFallbackCachePath = getBrainFallbackCachePath;
exports.getPlanCachePath = getPlanCachePath;
exports.getBrainStorageMode = getBrainStorageMode;
exports.setNoCodeStorageMode = setNoCodeStorageMode;
exports.isNoCodeStorageMode = isNoCodeStorageMode;
exports.readCachedPlan = readCachedPlan;
exports.peekCachedPlan = peekCachedPlan;
exports.writeCachedPlan = writeCachedPlan;
exports.listCachedPlans = listCachedPlans;
exports.deleteCachedPlans = deleteCachedPlans;
exports.findSimilarCachedPlans = findSimilarCachedPlans;
exports.findNearCachedPlan = findNearCachedPlan;
exports.diagnosePlanCacheMiss = diagnosePlanCacheMiss;
exports.getBrainDbSizeBytes = getBrainDbSizeBytes;
exports.getBrainStoreBackend = getBrainStoreBackend;
exports.closeBrainStore = closeBrainStore;
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const secret_masking_1 = require("./secret-masking");
let sqliteCtor = null;
function getSqliteCtor() {
    if (sqliteCtor)
        return sqliteCtor;
    try {
        sqliteCtor = require('better-sqlite3');
        return sqliteCtor;
    }
    catch {
        return null;
    }
}
const CACHE_SCHEMA_VERSION = 2;
const BRAIN_DB_FILE_NAME = 'brain.db';
const BRAIN_POINTER_FILE_NAME = 'brain.json';
const LEGACY_CACHE_FILE_NAME = 'plan-cache.json';
const FALLBACK_CACHE_FILE_NAME = 'plan-cache.json';
const MAX_ENTRIES = 500;
const NON_SEMANTIC_GIT_PATH_MARKERS = [
    '.neurcode/',
    '.gitignore',
];
const dbConnections = new Map();
let cachedCliVersion = null;
function sha256Hex(input) {
    return (0, crypto_1.createHash)('sha256').update(input).digest('hex');
}
function normalizeIntent(intent) {
    return intent
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}
function sanitizeGitStatusPorcelain(status) {
    const lines = status.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const filtered = lines.filter((line) => {
        for (const marker of NON_SEMANTIC_GIT_PATH_MARKERS) {
            if (line.includes(marker))
                return false;
        }
        return true;
    });
    return filtered.join('\n');
}
function normalizeRepoIdentity(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return '';
    // Convert SCP-like git syntax to URI form: git@host:owner/repo -> ssh://host/owner/repo
    let normalized = trimmed;
    const scpLike = /^[^@]+@[^:]+:.+$/;
    if (scpLike.test(trimmed)) {
        const at = trimmed.indexOf('@');
        const colon = trimmed.indexOf(':', at);
        const host = trimmed.slice(at + 1, colon);
        const repoPath = trimmed.slice(colon + 1);
        normalized = `ssh://${host}/${repoPath}`;
    }
    try {
        const parsed = new URL(normalized);
        parsed.username = '';
        parsed.password = '';
        const noAuth = `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/+$/, '');
        return noAuth.replace(/\.git$/i, '').toLowerCase();
    }
    catch {
        return normalized.replace(/\/+$/, '').replace(/\.git$/i, '').toLowerCase();
    }
}
function fallbackRepoIdentity(cwd) {
    return `local:${sha256Hex((0, path_1.resolve)(cwd))}`;
}
function getRepoIdentity(cwd) {
    try {
        const inside = (0, child_process_1.execSync)('git rev-parse --is-inside-work-tree', {
            cwd,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim().toLowerCase();
        if (inside === 'true') {
            const remote = (0, child_process_1.execSync)('git config --get remote.origin.url', {
                cwd,
                encoding: 'utf-8',
                stdio: ['ignore', 'pipe', 'ignore'],
            }).trim();
            const normalizedRemote = normalizeRepoIdentity(remote);
            if (normalizedRemote)
                return normalizedRemote;
        }
    }
    catch {
        // ignore
    }
    return fallbackRepoIdentity(cwd);
}
function getGitRepoFingerprint(cwd) {
    try {
        const inside = (0, child_process_1.execSync)('git rev-parse --is-inside-work-tree', {
            cwd,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim().toLowerCase();
        if (inside !== 'true')
            return null;
        const repoIdentity = getRepoIdentity(cwd);
        const headSha = (0, child_process_1.execSync)('git rev-parse HEAD', {
            cwd,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        const headTreeSha = (0, child_process_1.execSync)('git rev-parse HEAD^{tree}', {
            cwd,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        const status = (0, child_process_1.execSync)('git status --porcelain', {
            cwd,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        const workingTreeHash = sha256Hex(sanitizeGitStatusPorcelain(status));
        return { kind: 'git', repoIdentity, headSha, headTreeSha, workingTreeHash };
    }
    catch {
        return null;
    }
}
function getFilesystemFingerprintFromTree(fileTree, cwd = process.cwd()) {
    const normalized = [...fileTree].sort().join('\n');
    return {
        kind: 'filesystem',
        repoIdentity: fallbackRepoIdentity(cwd),
        fileTreeHash: sha256Hex(normalized),
    };
}
function computePromptHash(input) {
    const normalized = normalizeIntent(input.intent);
    const safeIntent = (0, secret_masking_1.maskSecretsInText)(normalized).masked;
    const payload = [
        `intent=${safeIntent}`,
        `ticketRef=${input.ticketRef || ''}`,
        `contextHash=${input.contextHash || ''}`,
    ].join('\n');
    return sha256Hex(payload);
}
function collectPolicyFiles(cwd) {
    const out = [];
    const candidates = [
        (0, path_1.join)(cwd, 'neurcode.policy.lock.json'),
        (0, path_1.join)(cwd, 'neurcode.policy.json'),
        (0, path_1.join)(cwd, 'neurcode.rules.json'),
        (0, path_1.join)(cwd, 'neurcode.policy.governance.json'),
        (0, path_1.join)(cwd, 'neurcode.policy.exceptions.json'),
        (0, path_1.join)(cwd, 'neurcode.policy.audit.log.jsonl'),
        (0, path_1.join)(cwd, '.neurcode', 'policy.json'),
        (0, path_1.join)(cwd, '.neurcode', 'rules.json'),
    ];
    for (const filePath of candidates) {
        if ((0, fs_1.existsSync)(filePath))
            out.push(filePath);
    }
    const policyDir = (0, path_1.join)(cwd, '.neurcode', 'policies');
    if ((0, fs_1.existsSync)(policyDir)) {
        const walk = (dir) => {
            const entries = (0, fs_1.readdirSync)(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = (0, path_1.join)(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(full);
                }
                else if (entry.isFile()) {
                    out.push(full);
                }
            }
        };
        try {
            walk(policyDir);
        }
        catch {
            // ignore unreadable dirs
        }
    }
    return [...new Set(out)].sort();
}
function computePolicyVersionHash(cwd) {
    const lines = [];
    const envPolicyVersion = process.env.NEURCODE_POLICY_VERSION;
    if (envPolicyVersion && envPolicyVersion.trim()) {
        lines.push(`env:${envPolicyVersion.trim()}`);
    }
    for (const policyFile of collectPolicyFiles(cwd)) {
        try {
            const content = (0, fs_1.readFileSync)(policyFile, 'utf-8');
            lines.push(`${policyFile}:${sha256Hex(content)}`);
        }
        catch {
            // ignore unreadable files
        }
    }
    if (lines.length === 0) {
        lines.push('default-policy');
    }
    return sha256Hex(lines.join('\n'));
}
function getNeurcodeVersion() {
    if (cachedCliVersion)
        return cachedCliVersion;
    const envVersion = process.env.npm_package_version;
    if (envVersion && envVersion.trim()) {
        cachedCliVersion = envVersion.trim();
        return cachedCliVersion;
    }
    const candidates = [
        (0, path_1.join)(__dirname, '../../package.json'),
        (0, path_1.join)(process.cwd(), 'packages/cli/package.json'),
        (0, path_1.join)(process.cwd(), 'package.json'),
    ];
    for (const path of candidates) {
        try {
            if (!(0, fs_1.existsSync)(path))
                continue;
            const raw = (0, fs_1.readFileSync)(path, 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed.version && parsed.version.trim()) {
                cachedCliVersion = parsed.version.trim();
                return cachedCliVersion;
            }
        }
        catch {
            // ignore parse/read errors
        }
    }
    cachedCliVersion = 'unknown';
    return cachedCliVersion;
}
function computePlanCacheKey(input) {
    const payload = [
        `v=${input.schemaVersion}`,
        `orgId=${input.orgId}`,
        `projectId=${input.projectId}`,
        `repoIdentity=${input.repo.repoIdentity}`,
        `repoKind=${input.repo.kind}`,
        input.repo.kind === 'git'
            ? [
                `headSha=${input.repo.headSha}`,
                `headTreeSha=${input.repo.headTreeSha}`,
                `workingTreeHash=${input.repo.workingTreeHash}`,
            ].join(';')
            : `fileTreeHash=${input.repo.fileTreeHash}`,
        `promptHash=${input.promptHash}`,
        `policyVersionHash=${input.policyVersionHash}`,
        `neurcodeVersion=${input.neurcodeVersion}`,
    ].join('\n');
    return sha256Hex(payload);
}
function getBrainDbPath(cwd) {
    return (0, path_1.join)(cwd, '.neurcode', BRAIN_DB_FILE_NAME);
}
function getBrainPointerPath(cwd) {
    return (0, path_1.join)(cwd, '.neurcode', BRAIN_POINTER_FILE_NAME);
}
function getFallbackCachePath(cwd) {
    return (0, path_1.join)(cwd, '.neurcode', FALLBACK_CACHE_FILE_NAME);
}
function getBrainFallbackCachePath(cwd) {
    return getFallbackCachePath(cwd);
}
// Backward-compatible helper name retained for callers.
function getPlanCachePath(cwd) {
    return getBrainDbPath(cwd);
}
function ensureNeurcodeDir(cwd) {
    const dir = (0, path_1.join)(cwd, '.neurcode');
    if (!(0, fs_1.existsSync)(dir)) {
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    }
}
function readFallbackCache(cwd) {
    try {
        const path = getFallbackCachePath(cwd);
        if (!(0, fs_1.existsSync)(path)) {
            return { schemaVersion: CACHE_SCHEMA_VERSION, entries: {} };
        }
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.schemaVersion !== CACHE_SCHEMA_VERSION || !parsed.entries || typeof parsed.entries !== 'object') {
            throw new Error('Invalid fallback cache schema');
        }
        return parsed;
    }
    catch {
        return { schemaVersion: CACHE_SCHEMA_VERSION, entries: {} };
    }
}
function writeFallbackCache(cwd, cache) {
    try {
        ensureNeurcodeDir(cwd);
        const path = getFallbackCachePath(cwd);
        const tmp = `${path}.tmp`;
        (0, fs_1.writeFileSync)(tmp, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
        (0, fs_1.renameSync)(tmp, path);
    }
    catch {
        // ignore
    }
}
function pruneFallback(cache) {
    const entries = Object.values(cache.entries);
    if (entries.length <= MAX_ENTRIES)
        return;
    entries.sort((a, b) => {
        const aTime = Date.parse(a.lastUsedAt) || 0;
        const bTime = Date.parse(b.lastUsedAt) || 0;
        return aTime - bTime;
    });
    const toDelete = entries.slice(0, Math.max(0, entries.length - MAX_ENTRIES));
    for (const entry of toDelete) {
        delete cache.entries[entry.key];
    }
}
function readJsonSafe(path) {
    try {
        if (!(0, fs_1.existsSync)(path))
            return null;
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function writePointer(cwd, pointer) {
    try {
        ensureNeurcodeDir(cwd);
        const pointerPath = getBrainPointerPath(cwd);
        (0, fs_1.writeFileSync)(pointerPath, JSON.stringify(pointer, null, 2) + '\n', 'utf-8');
    }
    catch {
        // ignore
    }
}
function updatePointer(cwd, patch) {
    const existing = readJsonSafe(getBrainPointerPath(cwd));
    const next = {
        schemaVersion: 1,
        dbPath: '.neurcode/brain.db',
        repoIdentity: patch.repoIdentity ?? existing?.repoIdentity,
        settings: {
            noCodeStorage: patch.settings?.noCodeStorage ?? existing?.settings?.noCodeStorage ?? false,
        },
        updatedAt: new Date().toISOString(),
    };
    writePointer(cwd, next);
}
function getBrainStorageMode(cwd) {
    const env = process.env.NEURCODE_BRAIN_NO_CODE_STORAGE;
    if (typeof env === 'string' && env.trim()) {
        const normalized = env.trim().toLowerCase();
        const enabled = normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
        return { noCodeStorage: enabled, source: 'env' };
    }
    const pointer = readJsonSafe(getBrainPointerPath(cwd));
    if (pointer?.settings && typeof pointer.settings.noCodeStorage === 'boolean') {
        return { noCodeStorage: pointer.settings.noCodeStorage, source: 'pointer' };
    }
    return { noCodeStorage: false, source: 'default' };
}
function setNoCodeStorageMode(cwd, enabled) {
    updatePointer(cwd, { settings: { noCodeStorage: enabled } });
}
function isNoCodeStorageMode(cwd) {
    return getBrainStorageMode(cwd).noCodeStorage;
}
function initDbSchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS brain_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plan_cache (
      key TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      use_count INTEGER NOT NULL DEFAULT 1,
      org_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      repo_kind TEXT NOT NULL,
      repo_identity TEXT NOT NULL,
      head_sha TEXT,
      head_tree_sha TEXT,
      working_tree_hash TEXT,
      file_tree_hash TEXT,
      prompt_hash TEXT NOT NULL,
      policy_version_hash TEXT NOT NULL,
      neurcode_version TEXT NOT NULL,
      intent_norm TEXT NOT NULL,
      intent_hash TEXT NOT NULL,
      ticket_ref TEXT,
      context_hash TEXT,
      response_json TEXT NOT NULL,
      no_code_storage INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_plan_cache_scope ON plan_cache(org_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_plan_cache_lru ON plan_cache(last_used_at);
    CREATE INDEX IF NOT EXISTS idx_plan_cache_repo ON plan_cache(repo_identity);
  `);
}
function getMeta(db, key) {
    try {
        const row = db.prepare('SELECT value FROM brain_meta WHERE key = ?').get(key);
        return row?.value || null;
    }
    catch {
        return null;
    }
}
function setMeta(db, key, value) {
    try {
        db.prepare(`
      INSERT INTO brain_meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
    }
    catch {
        // ignore
    }
}
function sanitizeCachedResponseForStorage(response, noCodeStorage) {
    if (!noCodeStorage) {
        return response;
    }
    const summaryMasked = (0, secret_masking_1.maskSecretsInText)(response.plan.summary || '').masked;
    const summaryHash = sha256Hex(summaryMasked);
    const files = (response.plan.files || []).slice(0, 80).map((file) => ({
        path: file.path,
        action: file.action,
        reason: [
            file.reason ? `reasonHash=${sha256Hex((0, secret_masking_1.maskSecretsInText)(file.reason).masked)}` : null,
            file.suggestion ? `suggestionHash=${sha256Hex((0, secret_masking_1.maskSecretsInText)(file.suggestion).masked)}` : null,
        ].filter(Boolean).join(' | ') || undefined,
        suggestion: undefined,
    }));
    const recommendations = (response.plan.recommendations || []).slice(0, 20).map((r) => {
        const masked = (0, secret_masking_1.maskSecretsInText)(r).masked;
        return `recHash=${sha256Hex(masked)}`;
    });
    return {
        ...response,
        plan: {
            ...response.plan,
            summary: `no-code-storage summaryHash=${summaryHash} files=${response.plan.files?.length || 0} recommendations=${response.plan.recommendations?.length || 0}`,
            files,
            recommendations,
        },
    };
}
function migrateLegacyJsonCache(cwd, db) {
    const migrationKey = 'legacy_plan_cache_migrated_v1';
    if (getMeta(db, migrationKey) === '1')
        return;
    const legacyPath = (0, path_1.join)(cwd, '.neurcode', LEGACY_CACHE_FILE_NAME);
    if (!(0, fs_1.existsSync)(legacyPath)) {
        setMeta(db, migrationKey, '1');
        return;
    }
    try {
        const raw = (0, fs_1.readFileSync)(legacyPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const entries = parsed?.entries && typeof parsed.entries === 'object' ? Object.values(parsed.entries) : [];
        const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO plan_cache (
        key,
        created_at,
        last_used_at,
        use_count,
        org_id,
        project_id,
        repo_kind,
        repo_identity,
        head_sha,
        head_tree_sha,
        working_tree_hash,
        file_tree_hash,
        prompt_hash,
        policy_version_hash,
        neurcode_version,
        intent_norm,
        intent_hash,
        ticket_ref,
        context_hash,
        response_json,
        no_code_storage
      ) VALUES (
        @key,
        @created_at,
        @last_used_at,
        @use_count,
        @org_id,
        @project_id,
        @repo_kind,
        @repo_identity,
        @head_sha,
        @head_tree_sha,
        @working_tree_hash,
        @file_tree_hash,
        @prompt_hash,
        @policy_version_hash,
        @neurcode_version,
        @intent_norm,
        @intent_hash,
        @ticket_ref,
        @context_hash,
        @response_json,
        @no_code_storage
      )
    `);
        for (const item of entries) {
            const legacy = item;
            const input = legacy?.input || {};
            const response = legacy?.response || null;
            if (!legacy?.key || !input?.orgId || !input?.projectId || !response)
                continue;
            const intentNorm = normalizeIntent(String(input.intent || ''));
            const intentHash = sha256Hex(intentNorm);
            const repoIdentity = getRepoIdentity(cwd);
            const repoKind = input.repo?.kind === 'git' ? 'git' : 'filesystem';
            const promptHash = computePromptHash({
                intent: intentNorm,
                ticketRef: input.ticketRef,
                contextHash: input.contextHash,
            });
            insertStmt.run({
                key: String(legacy.key),
                created_at: String(legacy.createdAt || new Date().toISOString()),
                last_used_at: String(legacy.lastUsedAt || legacy.createdAt || new Date().toISOString()),
                use_count: Number(legacy.useCount || 1),
                org_id: String(input.orgId),
                project_id: String(input.projectId),
                repo_kind: repoKind,
                repo_identity: repoIdentity,
                head_sha: repoKind === 'git' ? String(input.repo?.headSha || '') || null : null,
                head_tree_sha: repoKind === 'git' ? String(input.repo?.headTreeSha || '') || null : null,
                working_tree_hash: repoKind === 'git' ? String(input.repo?.statusHash || '') || null : null,
                file_tree_hash: repoKind === 'filesystem' ? String(input.repo?.fileTreeHash || '') || null : null,
                prompt_hash: promptHash,
                policy_version_hash: 'legacy',
                neurcode_version: 'legacy',
                intent_norm: intentNorm,
                intent_hash: intentHash,
                ticket_ref: input.ticketRef ? String(input.ticketRef) : null,
                context_hash: input.contextHash ? String(input.contextHash) : null,
                response_json: JSON.stringify(response),
                no_code_storage: 0,
            });
        }
        try {
            (0, fs_1.renameSync)(legacyPath, legacyPath.replace(/\.json$/, `.migrated-${Date.now()}.json`));
        }
        catch {
            // ignore rename failures
        }
    }
    catch {
        // ignore invalid legacy cache
    }
    setMeta(db, migrationKey, '1');
}
function getDb(cwd) {
    const dbPath = getBrainDbPath(cwd);
    const existing = dbConnections.get(dbPath);
    if (existing)
        return existing;
    const Ctor = getSqliteCtor();
    if (!Ctor)
        return null;
    try {
        ensureNeurcodeDir(cwd);
        const db = new Ctor(dbPath);
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        initDbSchema(db);
        migrateLegacyJsonCache(cwd, db);
        dbConnections.set(dbPath, db);
        return db;
    }
    catch {
        return null;
    }
}
function prune(db) {
    try {
        const row = db.prepare('SELECT COUNT(*) as count FROM plan_cache').get();
        const total = Number(row?.count || 0);
        if (total <= MAX_ENTRIES)
            return;
        const toDelete = total - MAX_ENTRIES;
        db.prepare(`
      DELETE FROM plan_cache
      WHERE key IN (
        SELECT key
        FROM plan_cache
        ORDER BY last_used_at ASC
        LIMIT ?
      )
    `).run(toDelete);
    }
    catch {
        // ignore
    }
}
function toEntry(row) {
    if (!row)
        return null;
    try {
        const response = JSON.parse(row.response_json);
        const repo = row.repo_kind === 'git'
            ? {
                kind: 'git',
                repoIdentity: row.repo_identity,
                headSha: row.head_sha || '',
                headTreeSha: row.head_tree_sha || '',
                workingTreeHash: row.working_tree_hash || '',
            }
            : {
                kind: 'filesystem',
                repoIdentity: row.repo_identity,
                fileTreeHash: row.file_tree_hash || '',
            };
        return {
            key: row.key,
            createdAt: row.created_at,
            lastUsedAt: row.last_used_at,
            useCount: Number(row.use_count || 0),
            input: {
                schemaVersion: CACHE_SCHEMA_VERSION,
                orgId: row.org_id,
                projectId: row.project_id,
                repo,
                promptHash: row.prompt_hash,
                policyVersionHash: row.policy_version_hash,
                neurcodeVersion: row.neurcode_version,
                intent: row.intent_norm || '',
                intentHash: row.intent_hash,
                ticketRef: row.ticket_ref || undefined,
                contextHash: row.context_hash || undefined,
            },
            response,
        };
    }
    catch {
        return null;
    }
}
function readCachedPlan(cwd, key) {
    try {
        const db = getDb(cwd);
        if (!db) {
            const cache = readFallbackCache(cwd);
            const existing = cache.entries[key];
            if (!existing)
                return null;
            const now = new Date().toISOString();
            const next = {
                ...existing,
                lastUsedAt: now,
                useCount: Number(existing.useCount || 0) + 1,
            };
            cache.entries[key] = next;
            pruneFallback(cache);
            writeFallbackCache(cwd, cache);
            return next;
        }
        const row = db.prepare('SELECT * FROM plan_cache WHERE key = ?').get(key);
        if (!row)
            return null;
        const now = new Date().toISOString();
        db.prepare(`
      UPDATE plan_cache
      SET last_used_at = ?, use_count = use_count + 1
      WHERE key = ?
    `).run(now, key);
        row.last_used_at = now;
        row.use_count = Number(row.use_count || 0) + 1;
        return toEntry(row);
    }
    catch {
        return null;
    }
}
function peekCachedPlan(cwd, key) {
    try {
        const db = getDb(cwd);
        if (!db) {
            const cache = readFallbackCache(cwd);
            return cache.entries[key] || null;
        }
        const row = db.prepare('SELECT * FROM plan_cache WHERE key = ?').get(key);
        return toEntry(row);
    }
    catch {
        return null;
    }
}
function writeCachedPlan(cwd, entry) {
    try {
        const now = new Date().toISOString();
        const noCodeStorage = isNoCodeStorageMode(cwd);
        const normalizedIntent = normalizeIntent(entry.input.intent || '');
        const safeIntent = (0, secret_masking_1.maskSecretsInText)(normalizedIntent).masked;
        const intentForStorage = noCodeStorage ? '' : safeIntent;
        const intentHash = sha256Hex(safeIntent);
        const responseToStore = sanitizeCachedResponseForStorage(entry.response, noCodeStorage);
        const repo = entry.input.repo;
        const repoIdentity = repo.repoIdentity || fallbackRepoIdentity(cwd);
        const db = getDb(cwd);
        if (!db) {
            const cache = readFallbackCache(cwd);
            const existing = cache.entries[entry.key];
            const next = {
                key: entry.key,
                createdAt: existing?.createdAt || now,
                lastUsedAt: now,
                useCount: Number(existing?.useCount || 0) + 1,
                input: {
                    ...entry.input,
                    schemaVersion: CACHE_SCHEMA_VERSION,
                    repo: {
                        ...repo,
                        repoIdentity,
                    },
                    intent: intentForStorage,
                    intentHash,
                    ticketRef: entry.input.ticketRef,
                    contextHash: entry.input.contextHash,
                },
                response: responseToStore,
            };
            cache.entries[entry.key] = next;
            pruneFallback(cache);
            writeFallbackCache(cwd, cache);
            updatePointer(cwd, {
                repoIdentity,
                settings: { noCodeStorage },
            });
            return;
        }
        db.prepare(`
      INSERT INTO plan_cache (
        key,
        created_at,
        last_used_at,
        use_count,
        org_id,
        project_id,
        repo_kind,
        repo_identity,
        head_sha,
        head_tree_sha,
        working_tree_hash,
        file_tree_hash,
        prompt_hash,
        policy_version_hash,
        neurcode_version,
        intent_norm,
        intent_hash,
        ticket_ref,
        context_hash,
        response_json,
        no_code_storage
      ) VALUES (
        @key,
        @created_at,
        @last_used_at,
        1,
        @org_id,
        @project_id,
        @repo_kind,
        @repo_identity,
        @head_sha,
        @head_tree_sha,
        @working_tree_hash,
        @file_tree_hash,
        @prompt_hash,
        @policy_version_hash,
        @neurcode_version,
        @intent_norm,
        @intent_hash,
        @ticket_ref,
        @context_hash,
        @response_json,
        @no_code_storage
      )
      ON CONFLICT(key) DO UPDATE SET
        last_used_at = excluded.last_used_at,
        use_count = plan_cache.use_count + 1,
        org_id = excluded.org_id,
        project_id = excluded.project_id,
        repo_kind = excluded.repo_kind,
        repo_identity = excluded.repo_identity,
        head_sha = excluded.head_sha,
        head_tree_sha = excluded.head_tree_sha,
        working_tree_hash = excluded.working_tree_hash,
        file_tree_hash = excluded.file_tree_hash,
        prompt_hash = excluded.prompt_hash,
        policy_version_hash = excluded.policy_version_hash,
        neurcode_version = excluded.neurcode_version,
        intent_norm = excluded.intent_norm,
        intent_hash = excluded.intent_hash,
        ticket_ref = excluded.ticket_ref,
        context_hash = excluded.context_hash,
        response_json = excluded.response_json,
        no_code_storage = excluded.no_code_storage
    `).run({
            key: entry.key,
            created_at: now,
            last_used_at: now,
            org_id: entry.input.orgId,
            project_id: entry.input.projectId,
            repo_kind: repo.kind,
            repo_identity: repoIdentity,
            head_sha: repo.kind === 'git' ? repo.headSha : null,
            head_tree_sha: repo.kind === 'git' ? repo.headTreeSha : null,
            working_tree_hash: repo.kind === 'git' ? repo.workingTreeHash : null,
            file_tree_hash: repo.kind === 'filesystem' ? repo.fileTreeHash : null,
            prompt_hash: entry.input.promptHash,
            policy_version_hash: entry.input.policyVersionHash,
            neurcode_version: entry.input.neurcodeVersion,
            intent_norm: intentForStorage,
            intent_hash: intentHash,
            ticket_ref: entry.input.ticketRef || null,
            context_hash: entry.input.contextHash || null,
            response_json: JSON.stringify(responseToStore),
            no_code_storage: noCodeStorage ? 1 : 0,
        });
        prune(db);
        updatePointer(cwd, {
            repoIdentity,
            settings: { noCodeStorage },
        });
    }
    catch {
        // Cache failures should never block plan generation.
    }
}
function listCachedPlans(cwd) {
    try {
        const db = getDb(cwd);
        if (!db) {
            const cache = readFallbackCache(cwd);
            return Object.values(cache.entries).sort((a, b) => {
                const aTime = Date.parse(a.lastUsedAt) || 0;
                const bTime = Date.parse(b.lastUsedAt) || 0;
                return bTime - aTime;
            });
        }
        const rows = db.prepare('SELECT * FROM plan_cache ORDER BY last_used_at DESC').all();
        return rows.map((row) => toEntry(row)).filter(Boolean);
    }
    catch {
        return [];
    }
}
function deleteCachedPlans(cwd, shouldDelete) {
    try {
        const db = getDb(cwd);
        if (!db) {
            const cache = readFallbackCache(cwd);
            let deleted = 0;
            for (const [key, entry] of Object.entries(cache.entries)) {
                if (!entry)
                    continue;
                if (shouldDelete(entry)) {
                    delete cache.entries[key];
                    deleted++;
                }
            }
            pruneFallback(cache);
            writeFallbackCache(cwd, cache);
            return { deleted, remaining: Object.keys(cache.entries).length };
        }
        const rows = db.prepare('SELECT * FROM plan_cache').all();
        const entries = rows.map((row) => toEntry(row)).filter(Boolean);
        const keysToDelete = entries.filter((entry) => shouldDelete(entry)).map((entry) => entry.key);
        const stmt = db.prepare('DELETE FROM plan_cache WHERE key = ?');
        for (const key of keysToDelete) {
            stmt.run(key);
        }
        const remainingRow = db.prepare('SELECT COUNT(*) as count FROM plan_cache').get();
        return { deleted: keysToDelete.length, remaining: Number(remainingRow?.count || 0) };
    }
    catch {
        return { deleted: 0, remaining: 0 };
    }
}
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 3);
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
function intentSimilarityScore(aIntent, bIntent) {
    const aNorm = normalizeIntent(aIntent);
    const bNorm = normalizeIntent(bIntent);
    const a = new Set(tokenize(aNorm));
    const b = new Set(tokenize(bNorm));
    if (a.size === 0 || b.size === 0)
        return 0;
    const jac = jaccard(a, b);
    const overlap = tokenOverlap(a, b);
    const dice = diceCoefficient(buildTrigrams(aNorm), buildTrigrams(bNorm));
    return jac * 0.45 + overlap * 0.35 + dice * 0.2;
}
function sameRepoSnapshot(current, cached) {
    if (current.kind !== cached.kind)
        return false;
    if (current.repoIdentity !== cached.repoIdentity)
        return false;
    if (current.kind === 'git' && cached.kind === 'git') {
        return current.headTreeSha === cached.headTreeSha;
    }
    if (current.kind === 'filesystem' && cached.kind === 'filesystem') {
        return current.fileTreeHash === cached.fileTreeHash;
    }
    return false;
}
function listScopeEntries(cwd, scope) {
    try {
        const db = getDb(cwd);
        if (!db) {
            const cache = readFallbackCache(cwd);
            return Object.values(cache.entries).filter((entry) => entry.input.orgId === scope.orgId && entry.input.projectId === scope.projectId);
        }
        const rows = db.prepare(`
      SELECT *
      FROM plan_cache
      WHERE org_id = ? AND project_id = ?
      ORDER BY last_used_at DESC
      LIMIT 220
    `).all(scope.orgId, scope.projectId);
        return rows.map((row) => toEntry(row)).filter(Boolean);
    }
    catch {
        return [];
    }
}
function findSimilarCachedPlans(cwd, filter, intent, k = 3) {
    try {
        const db = getDb(cwd);
        const normalizedIntent = normalizeIntent(intent);
        const queryTokens = new Set(tokenize(normalizedIntent));
        if (queryTokens.size === 0)
            return [];
        if (!db) {
            const cache = readFallbackCache(cwd);
            const entries = Object.values(cache.entries)
                .filter((entry) => entry.input.orgId === filter.orgId && entry.input.projectId === filter.projectId)
                .filter((entry) => !filter.repoIdentity || entry.input.repo.repoIdentity === filter.repoIdentity)
                .filter((entry) => Boolean(entry.input.intent));
            const scored = entries
                .map((entry) => {
                const tokens = new Set(tokenize(entry.input.intent || ''));
                const score = jaccard(queryTokens, tokens);
                if (score <= 0)
                    return null;
                return { entry, score };
            })
                .filter(Boolean);
            return scored
                .sort((a, b) => b.score - a.score)
                .slice(0, k)
                .map((x) => x.entry);
        }
        const rows = filter.repoIdentity
            ? db.prepare(`
          SELECT *
          FROM plan_cache
          WHERE org_id = ? AND project_id = ? AND repo_identity = ? AND intent_norm <> ''
          ORDER BY last_used_at DESC
          LIMIT 120
        `).all(filter.orgId, filter.projectId, filter.repoIdentity)
            : db.prepare(`
          SELECT *
          FROM plan_cache
          WHERE org_id = ? AND project_id = ? AND intent_norm <> ''
          ORDER BY last_used_at DESC
          LIMIT 120
        `).all(filter.orgId, filter.projectId);
        const scored = rows
            .map((row) => {
            const entry = toEntry(row);
            if (!entry)
                return null;
            if (!entry.input.intent)
                return null;
            const tokens = new Set(tokenize(entry.input.intent));
            const score = jaccard(queryTokens, tokens);
            if (score <= 0)
                return null;
            return { entry, score };
        })
            .filter(Boolean);
        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, k)
            .map((x) => x.entry);
    }
    catch {
        return [];
    }
}
function findNearCachedPlan(cwd, input) {
    try {
        const normalizedIntent = normalizeIntent(input.intent);
        if (!normalizedIntent)
            return null;
        const queryTokens = new Set(tokenize(normalizedIntent));
        if (queryTokens.size === 0)
            return null;
        const thresholdBase = Math.max(0.62, Math.min(input.minIntentSimilarity ?? 0.7, 0.99));
        const threshold = queryTokens.size <= 4
            ? Math.max(thresholdBase, 0.82)
            : queryTokens.size <= 8
                ? Math.max(thresholdBase, 0.72)
                : thresholdBase;
        const candidates = listScopeEntries(cwd, {
            orgId: input.orgId,
            projectId: input.projectId,
        });
        let best = null;
        for (const candidate of candidates) {
            if (!candidate.input.intent)
                continue;
            if (!sameRepoSnapshot(input.repo, candidate.input.repo))
                continue;
            if (candidate.input.policyVersionHash !== input.policyVersionHash)
                continue;
            if (candidate.input.neurcodeVersion !== input.neurcodeVersion)
                continue;
            if (input.ticketRef && candidate.input.ticketRef && candidate.input.ticketRef !== input.ticketRef)
                continue;
            if (input.contextHash && candidate.input.contextHash && candidate.input.contextHash !== input.contextHash)
                continue;
            const score = intentSimilarityScore(normalizedIntent, candidate.input.intent);
            if (score < threshold)
                continue;
            const result = {
                entry: candidate,
                intentSimilarity: score,
                reason: 'same_snapshot_similar_intent',
            };
            if (!best) {
                best = result;
                continue;
            }
            if (result.intentSimilarity > best.intentSimilarity) {
                best = result;
                continue;
            }
            if (result.intentSimilarity === best.intentSimilarity) {
                const bestTime = Date.parse(best.entry.lastUsedAt || best.entry.createdAt) || 0;
                const nextTime = Date.parse(result.entry.lastUsedAt || result.entry.createdAt) || 0;
                if (nextTime > bestTime)
                    best = result;
            }
        }
        return best;
    }
    catch {
        return null;
    }
}
function diagnosePlanCacheMiss(cwd, input) {
    const scopeEntries = listScopeEntries(cwd, {
        orgId: input.orgId,
        projectId: input.projectId,
    });
    const repoEntries = scopeEntries.filter((entry) => entry.input.repo.repoIdentity === input.repo.repoIdentity);
    const snapshotEntries = repoEntries.filter((entry) => sameRepoSnapshot(input.repo, entry.input.repo));
    const policyEntries = snapshotEntries.filter((entry) => entry.input.policyVersionHash === input.policyVersionHash);
    const versionEntries = policyEntries.filter((entry) => entry.input.neurcodeVersion === input.neurcodeVersion);
    let bestIntentSimilarity = 0;
    let bestIntent;
    const normalizedIntent = normalizeIntent(input.intent);
    if (normalizedIntent) {
        for (const entry of versionEntries) {
            if (!entry.input.intent)
                continue;
            const score = intentSimilarityScore(normalizedIntent, entry.input.intent);
            if (score > bestIntentSimilarity) {
                bestIntentSimilarity = score;
                bestIntent = entry.input.intent;
            }
        }
    }
    let reason;
    if (scopeEntries.length === 0)
        reason = 'no_scope_entries';
    else if (repoEntries.length === 0)
        reason = 'repo_identity_changed';
    else if (snapshotEntries.length === 0)
        reason = 'repo_snapshot_changed';
    else if (policyEntries.length === 0)
        reason = 'policy_changed';
    else if (versionEntries.length === 0)
        reason = 'neurcode_version_changed';
    else
        reason = 'prompt_changed';
    return {
        reason,
        scopedEntries: scopeEntries.length,
        repoEntries: repoEntries.length,
        comparableSnapshotEntries: snapshotEntries.length,
        policyMatchedEntries: policyEntries.length,
        versionMatchedEntries: versionEntries.length,
        bestIntentSimilarity,
        bestIntent,
    };
}
function getBrainDbSizeBytes(cwd) {
    try {
        const dbPath = getBrainDbPath(cwd);
        if (!(0, fs_1.existsSync)(dbPath))
            return null;
        return (0, fs_1.statSync)(dbPath).size;
    }
    catch {
        return null;
    }
}
function getBrainStoreBackend(cwd) {
    const db = getDb(cwd);
    return db ? 'sqlite' : 'json-fallback';
}
function closeBrainStore(cwd) {
    try {
        if (cwd) {
            const dbPath = getBrainDbPath(cwd);
            const db = dbConnections.get(dbPath);
            if (db) {
                try {
                    db.close();
                }
                catch {
                    // ignore
                }
                dbConnections.delete(dbPath);
            }
            return;
        }
        for (const [dbPath, db] of dbConnections.entries()) {
            try {
                db.close();
            }
            catch {
                // ignore
            }
            dbConnections.delete(dbPath);
        }
    }
    catch {
        // ignore
    }
}
//# sourceMappingURL=plan-cache.js.map