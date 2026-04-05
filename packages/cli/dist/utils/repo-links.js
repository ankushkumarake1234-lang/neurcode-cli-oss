"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalizeRepoPath = canonicalizeRepoPath;
exports.getRepoLinksPath = getRepoLinksPath;
exports.loadRepoLinks = loadRepoLinks;
exports.saveRepoLinks = saveRepoLinks;
exports.upsertRepoLink = upsertRepoLink;
exports.removeRepoLink = removeRepoLink;
exports.findRepoLink = findRepoLink;
exports.isRepoPathExplicitlyLinked = isRepoPathExplicitlyLinked;
const fs_1 = require("fs");
const path_1 = require("path");
const REPO_LINKS_FILENAME = 'repo-links.json';
function canonicalizeRepoPath(pathValue) {
    try {
        return (0, fs_1.realpathSync)(pathValue);
    }
    catch {
        return (0, path_1.resolve)(pathValue);
    }
}
function isPathWithin(parent, candidate) {
    const rel = (0, path_1.relative)(parent, candidate);
    return rel === '' || (!rel.startsWith('..') && !(0, path_1.isAbsolute)(rel));
}
function normalizeAlias(input) {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed)
        return '';
    return trimmed.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}
function dedupeByAliasAndPath(links) {
    const byAlias = new Map();
    for (const link of links) {
        const aliasKey = normalizeAlias(link.alias);
        const normalizedPath = canonicalizeRepoPath(link.path);
        if (!aliasKey || !normalizedPath)
            continue;
        if (!byAlias.has(aliasKey)) {
            byAlias.set(aliasKey, {
                alias: aliasKey,
                path: normalizedPath,
                linkedAt: link.linkedAt || new Date().toISOString(),
            });
        }
    }
    return Array.from(byAlias.values()).sort((a, b) => a.alias.localeCompare(b.alias));
}
function getRepoLinksPath(projectRoot) {
    return (0, path_1.join)(projectRoot, '.neurcode', REPO_LINKS_FILENAME);
}
function loadRepoLinks(projectRoot) {
    const pathValue = getRepoLinksPath(projectRoot);
    if (!(0, fs_1.existsSync)(pathValue)) {
        return [];
    }
    try {
        const parsed = JSON.parse((0, fs_1.readFileSync)(pathValue, 'utf-8'));
        if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.links)) {
            return [];
        }
        return dedupeByAliasAndPath(parsed.links.map((link) => ({
            alias: typeof link.alias === 'string' ? link.alias : '',
            path: typeof link.path === 'string' ? link.path : '',
            linkedAt: typeof link.linkedAt === 'string' ? link.linkedAt : '',
        })));
    }
    catch {
        return [];
    }
}
function saveRepoLinks(projectRoot, links) {
    const pathValue = getRepoLinksPath(projectRoot);
    const dir = (0, path_1.join)(projectRoot, '.neurcode');
    if (!(0, fs_1.existsSync)(dir)) {
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    }
    const payload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        links: dedupeByAliasAndPath(links),
    };
    (0, fs_1.writeFileSync)(pathValue, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
}
function upsertRepoLink(projectRoot, input) {
    const current = loadRepoLinks(projectRoot);
    const canonicalPath = canonicalizeRepoPath(input.path);
    const aliasInput = input.alias?.trim() || (0, path_1.basename)(canonicalPath);
    const alias = normalizeAlias(aliasInput);
    if (!alias) {
        throw new Error('Alias could not be derived from provided input.');
    }
    const filtered = current.filter((link) => normalizeAlias(link.alias) !== alias && canonicalizeRepoPath(link.path) !== canonicalPath);
    const next = {
        alias,
        path: canonicalPath,
        linkedAt: new Date().toISOString(),
    };
    filtered.push(next);
    saveRepoLinks(projectRoot, filtered);
    return next;
}
function removeRepoLink(projectRoot, aliasOrPath) {
    const current = loadRepoLinks(projectRoot);
    const canonical = canonicalizeRepoPath(aliasOrPath);
    const alias = normalizeAlias(aliasOrPath);
    const removed = current.find((link) => normalizeAlias(link.alias) === alias || canonicalizeRepoPath(link.path) === canonical);
    if (!removed) {
        return null;
    }
    const remaining = current.filter((link) => normalizeAlias(link.alias) !== normalizeAlias(removed.alias) &&
        canonicalizeRepoPath(link.path) !== canonicalizeRepoPath(removed.path));
    saveRepoLinks(projectRoot, remaining);
    return removed;
}
function findRepoLink(projectRoot, aliasOrPath) {
    const canonical = canonicalizeRepoPath(aliasOrPath);
    const alias = normalizeAlias(aliasOrPath);
    for (const link of loadRepoLinks(projectRoot)) {
        if (normalizeAlias(link.alias) === alias || canonicalizeRepoPath(link.path) === canonical) {
            return link;
        }
    }
    return null;
}
function isRepoPathExplicitlyLinked(projectRoot, candidatePath) {
    const canonicalCandidate = canonicalizeRepoPath(candidatePath);
    for (const link of loadRepoLinks(projectRoot)) {
        const canonicalLink = canonicalizeRepoPath(link.path);
        if (canonicalLink === canonicalCandidate || isPathWithin(canonicalLink, canonicalCandidate)) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=repo-links.js.map