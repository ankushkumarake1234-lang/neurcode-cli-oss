"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runBreakageSimulation = runBreakageSimulation;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const diff_parser_1 = require("@neurcode-ai/diff-parser");
const map_1 = require("../commands/map");
const ProjectScanner_1 = require("../services/mapper/ProjectScanner");
const DEFAULT_MAX_IMPACTED = 50;
const DEFAULT_MAX_DEPTH = 3;
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
function runGit(cwd, args) {
    const result = (0, child_process_1.spawnSync)('git', args, {
        cwd,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 512,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
        code: result.status ?? 1,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
    };
}
function safeBranch(cwd) {
    const result = runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    return result.code === 0 ? result.stdout.trim() : 'unknown';
}
function safeHeadSha(cwd) {
    const result = runGit(cwd, ['rev-parse', 'HEAD']);
    return result.code === 0 ? result.stdout.trim() : 'unknown';
}
function getDiffText(cwd, mode, baseRef) {
    if (mode === 'staged') {
        return runGit(cwd, ['diff', '--staged']).stdout;
    }
    if (mode === 'head') {
        return runGit(cwd, ['diff', 'HEAD']).stdout;
    }
    if (mode === 'base' && baseRef) {
        return runGit(cwd, ['diff', baseRef]).stdout;
    }
    const staged = runGit(cwd, ['diff', '--staged']).stdout;
    const unstaged = runGit(cwd, ['diff']).stdout;
    if (staged && unstaged)
        return `${staged}\n${unstaged}`;
    return staged || unstaged;
}
function getUntrackedFiles(cwd) {
    const result = runGit(cwd, ['ls-files', '--others', '--exclude-standard']);
    if (result.code !== 0)
        return [];
    const files = result.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    const stats = [];
    for (const filePath of files) {
        try {
            const raw = (0, fs_1.readFileSync)((0, path_1.resolve)(cwd, filePath), 'utf-8');
            const lineCount = raw.length === 0 ? 0 : raw.split(/\r?\n/).length;
            stats.push({
                path: filePath,
                changeType: 'add',
                added: lineCount,
                removed: 0,
            });
        }
        catch {
            stats.push({
                path: filePath,
                changeType: 'add',
                added: 0,
                removed: 0,
            });
        }
    }
    return stats;
}
function normalizePath(p) {
    return p.replace(/\\/g, '/').replace(/^\.\//, '');
}
function toChangedStats(diffFiles) {
    return diffFiles.map((file) => ({
        path: normalizePath(file.path),
        changeType: file.changeType,
        added: file.addedLines,
        removed: file.removedLines,
    }));
}
function resolveLocalImport(fromFile, specifier, fileSet) {
    if (!specifier.startsWith('.'))
        return null;
    const fromDir = path_1.posix.dirname(normalizePath(fromFile));
    const base = path_1.posix.normalize(path_1.posix.join(fromDir, specifier));
    const candidates = [base];
    if (!EXTENSIONS.some((ext) => base.endsWith(ext))) {
        for (const ext of EXTENSIONS) {
            candidates.push(`${base}${ext}`);
        }
        for (const ext of EXTENSIONS) {
            candidates.push(path_1.posix.join(base, `index${ext}`));
        }
    }
    for (const candidate of candidates) {
        if (fileSet.has(candidate))
            return candidate;
    }
    return null;
}
function buildDependencyGraph(map) {
    const forward = new Map();
    const reverse = new Map();
    const filePaths = Object.keys(map.files).map((file) => normalizePath(file));
    const fileSet = new Set(filePaths);
    let edgeCount = 0;
    for (const filePath of filePaths) {
        if (!forward.has(filePath)) {
            forward.set(filePath, new Set());
        }
    }
    for (const [rawFilePath, metadata] of Object.entries(map.files)) {
        const filePath = normalizePath(rawFilePath);
        for (const item of metadata.imports || []) {
            const target = resolveLocalImport(filePath, item.from, fileSet);
            if (!target)
                continue;
            const deps = forward.get(filePath) || new Set();
            if (!deps.has(target)) {
                deps.add(target);
                forward.set(filePath, deps);
                edgeCount += 1;
            }
            const dependents = reverse.get(target) || new Set();
            dependents.add(filePath);
            reverse.set(target, dependents);
        }
    }
    return { reverse, forward, edgeCount };
}
function computeImpactedFiles(changed, reverse, maxDepth, maxImpacted) {
    const queue = [];
    const seen = new Map();
    const changedSet = new Set(changed.map((item) => normalizePath(item)));
    for (const path of changedSet) {
        queue.push({ path, depth: 0 });
        seen.set(path, 0);
    }
    while (queue.length > 0 && seen.size < maxImpacted + changedSet.size) {
        const current = queue.shift();
        if (!current)
            break;
        if (current.depth >= maxDepth)
            continue;
        const dependents = reverse.get(current.path);
        if (!dependents)
            continue;
        for (const dependent of dependents) {
            if (!seen.has(dependent) || (seen.get(dependent) || Infinity) > current.depth + 1) {
                seen.set(dependent, current.depth + 1);
                queue.push({ path: dependent, depth: current.depth + 1 });
            }
        }
    }
    const impacted = [];
    for (const [path, distance] of seen.entries()) {
        if (distance === 0)
            continue;
        impacted.push({ path, distance });
    }
    impacted.sort((a, b) => {
        if (a.distance !== b.distance)
            return a.distance - b.distance;
        return a.path.localeCompare(b.path);
    });
    return impacted.slice(0, maxImpacted);
}
function countRegex(lines, pattern) {
    const matches = lines.match(pattern);
    return matches ? matches.length : 0;
}
function detectRegressions(input) {
    const changedPaths = input.changed.map((file) => file.path.toLowerCase());
    const regressions = [];
    const hasAuth = changedPaths.some((path) => /auth|session|token|middleware|org|tenant|identity|permission/.test(path));
    const hasApi = changedPaths.some((path) => /routes|controller|api-client|graphql|openapi|schema|dto/.test(path));
    const hasDb = changedPaths.some((path) => /migration|schema|prisma|sql|db\//.test(path));
    const hasConfig = changedPaths.some((path) => /package\.json|pnpm-lock|yarn\.lock|tsconfig|docker|compose|env/.test(path));
    const addedSignature = countRegex(input.diffText, /^\+.*\b(export\s+)?(async\s+)?function\s+[A-Za-z0-9_]+\s*\(/gm);
    const removedSignature = countRegex(input.diffText, /^-.*\b(export\s+)?(async\s+)?function\s+[A-Za-z0-9_]+\s*\(/gm);
    const interfaceDelta = countRegex(input.diffText, /^[+-].*\b(interface|type)\b/gm);
    if (hasApi && (addedSignature + removedSignature + interfaceDelta) > 0) {
        regressions.push({
            id: 'api-contract-drift',
            title: 'API Contract Drift',
            severity: 'high',
            confidence: 0.82,
            reason: 'Public API-facing files changed alongside signature/type edits; downstream consumers may break.',
            evidence: [
                `${addedSignature + removedSignature} function signature line(s) changed`,
                `${interfaceDelta} interface/type line(s) changed`,
            ],
        });
    }
    if (hasAuth) {
        regressions.push({
            id: 'auth-context-regression',
            title: 'Auth/Org Context Regression',
            severity: 'high',
            confidence: 0.76,
            reason: 'Authentication or tenancy-sensitive modules changed; permission boundaries should be re-verified.',
            evidence: [
                `${input.changed.length} changed file(s) include auth/org/session paths`,
            ],
        });
    }
    if (hasDb) {
        regressions.push({
            id: 'data-migration-risk',
            title: 'Data Migration / Schema Risk',
            severity: 'high',
            confidence: 0.8,
            reason: 'Database schema or migration files changed; runtime compatibility and rollout sequencing are at risk.',
            evidence: [
                'Migration/schema-related files detected in change set',
            ],
        });
    }
    if (hasConfig) {
        regressions.push({
            id: 'build-config-regression',
            title: 'Build/Runtime Configuration Drift',
            severity: 'medium',
            confidence: 0.63,
            reason: 'Build/config dependencies changed and can fail CI/CD or runtime boot paths.',
            evidence: ['Package/config/container files changed'],
        });
    }
    if (input.impacted.length >= 20) {
        regressions.push({
            id: 'wide-blast-radius',
            title: 'Wide Blast Radius',
            severity: input.impacted.length >= 40 ? 'high' : 'medium',
            confidence: 0.67,
            reason: 'Reverse dependency impact is broad; non-obvious transitive breakages are more likely.',
            evidence: [`${input.impacted.length} impacted file(s) inferred by dependency graph`],
        });
    }
    if (regressions.length === 0) {
        regressions.push({
            id: 'localized-change',
            title: 'Localized Change Set',
            severity: 'low',
            confidence: 0.59,
            reason: 'No high-risk structural signals detected; likely regression scope is localized.',
            evidence: [`${input.changed.length} changed file(s), ${input.impacted.length} impacted file(s)`],
        });
    }
    return regressions;
}
function buildRecommendations(regressions) {
    const lines = [];
    if (regressions.some((item) => item.id === 'auth-context-regression')) {
        lines.push('Run authentication + authorization integration tests, including org/tenant scope checks.');
    }
    if (regressions.some((item) => item.id === 'api-contract-drift')) {
        lines.push('Run API contract/consumer tests and verify backward compatibility for modified endpoints/types.');
    }
    if (regressions.some((item) => item.id === 'data-migration-risk')) {
        lines.push('Dry-run migrations in staging with rollback validation before production rollout.');
    }
    if (regressions.some((item) => item.id === 'build-config-regression')) {
        lines.push('Run a clean install/build in CI to validate dependency and environment configuration changes.');
    }
    lines.push('Run `neurcode verify --record` before merge to capture policy status and scope compliance.');
    return [...new Set(lines)].slice(0, 8);
}
async function runBreakageSimulation(cwd, options = {}) {
    const mode = options.mode || 'working';
    const maxImpacted = Math.max(10, Math.min(options.maxImpacted || DEFAULT_MAX_IMPACTED, 200));
    const maxDepth = Math.max(1, Math.min(options.maxDepth || DEFAULT_MAX_DEPTH, 5));
    const diffText = getDiffText(cwd, mode, options.baseRef);
    const parsedDiff = diffText.trim() ? (0, diff_parser_1.parseDiff)(diffText) : [];
    const changed = toChangedStats(parsedDiff);
    const untracked = getUntrackedFiles(cwd).filter((file) => !changed.some((entry) => entry.path === file.path));
    changed.push(...untracked);
    const summary = (0, diff_parser_1.getDiffSummary)(parsedDiff);
    const untrackedAdded = untracked.reduce((sum, file) => sum + file.added, 0);
    const persistedMap = (0, map_1.loadAssetMap)(cwd);
    const projectMap = persistedMap || await new ProjectScanner_1.ProjectScanner(cwd).scan();
    const graph = buildDependencyGraph(projectMap);
    const impacted = computeImpactedFiles(changed.map((item) => item.path), graph.reverse, maxDepth, maxImpacted);
    const regressions = detectRegressions({ changed, impacted, diffText });
    const recommendations = buildRecommendations(regressions);
    return {
        generatedAt: new Date().toISOString(),
        mode,
        baseRef: mode === 'base' ? options.baseRef : undefined,
        repository: {
            root: cwd,
            branch: safeBranch(cwd),
            headSha: safeHeadSha(cwd),
        },
        summary: {
            changedFiles: changed.length,
            linesAdded: summary.totalAdded + untrackedAdded,
            linesRemoved: summary.totalRemoved,
            impactedFiles: impacted.length,
            predictedRegressions: regressions.length,
        },
        changed,
        impacted,
        regressions,
        recommendations,
        coverage: {
            usedPersistedAssetMap: Boolean(persistedMap),
            scannedFiles: Object.keys(projectMap.files).length,
            dependencyEdges: graph.edgeCount,
        },
    };
}
//# sourceMappingURL=breakage-simulator.js.map