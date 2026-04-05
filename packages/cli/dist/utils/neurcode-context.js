"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrgProjectDir = getOrgProjectDir;
exports.getOrgProjectMemoryPath = getOrgProjectMemoryPath;
exports.getOrgProjectContextPath = getOrgProjectContextPath;
exports.ensureDefaultLocalContextFile = ensureDefaultLocalContextFile;
exports.loadStaticNeurcodeContext = loadStaticNeurcodeContext;
exports.loadOrgProjectMemoryTail = loadOrgProjectMemoryTail;
exports.appendPlanToOrgProjectMemory = appendPlanToOrgProjectMemory;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const gitignore_1 = require("./gitignore");
const secret_masking_1 = require("./secret-masking");
const STATIC_MAX_BYTES_PER_FILE = 24 * 1024; // keep prompt small and deterministic
const STATIC_MAX_TOTAL_BYTES = 64 * 1024;
const MEMORY_MAX_ENTRIES = 100;
const MEMORY_TAIL_MAX_BYTES = 12 * 1024; // only inject recent memory
const MEMORY_ENTRY_MARKER = '<!-- neurcode-memory-entry -->';
function sha256Hex(input) {
    return (0, crypto_1.createHash)('sha256').update(input).digest('hex');
}
function readUtf8Limited(filePath, opts) {
    const size = (0, fs_1.statSync)(filePath).size;
    const truncated = size > opts.maxBytes;
    const text = (0, fs_1.readFileSync)(filePath, 'utf-8');
    if (!truncated) {
        return { text, bytes: Buffer.byteLength(text, 'utf-8'), truncated: false };
    }
    if (opts.mode === 'head') {
        const sliced = text.slice(0, opts.maxBytes);
        return { text: sliced, bytes: Buffer.byteLength(sliced, 'utf-8'), truncated: true };
    }
    // tail
    const sliced = text.slice(Math.max(0, text.length - opts.maxBytes));
    return { text: sliced, bytes: Buffer.byteLength(sliced, 'utf-8'), truncated: true };
}
function safeParseJsonContext(raw) {
    try {
        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== 'object')
            return null;
        const parts = [];
        if (typeof obj.context === 'string' && obj.context.trim()) {
            parts.push(obj.context.trim());
        }
        const list = (label, items) => {
            if (!Array.isArray(items))
                return;
            const clean = items.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
            if (clean.length === 0)
                return;
            parts.push(`${label}:\n${clean.map((x) => `- ${x}`).join('\n')}`);
        };
        list('Invariants', obj.invariants);
        list('Domain Boundaries', obj.domainBoundaries);
        list('Conventions', obj.conventions);
        list('Commands', obj.commands);
        list('Gotchas', obj.gotchas);
        if (parts.length === 0)
            return null;
        return { text: parts.join('\n\n') };
    }
    catch {
        return null;
    }
}
function combineContextBlocks(blocks) {
    const lines = [];
    lines.push('NEURCODE CONTEXT (project rules; follow strictly):');
    for (const b of blocks) {
        lines.push('');
        lines.push(`[${b.label}] (${b.path})`);
        lines.push(b.text.trim());
    }
    lines.push('');
    return lines.join('\n');
}
function getOrgProjectDir(cwd, orgId, projectId) {
    return (0, path_1.join)(cwd, '.neurcode', 'orgs', orgId, 'projects', projectId);
}
function getOrgProjectMemoryPath(cwd, orgId, projectId) {
    return (0, path_1.join)(getOrgProjectDir(cwd, orgId, projectId), 'memory.md');
}
function getOrgProjectContextPath(cwd, orgId, projectId) {
    return (0, path_1.join)(getOrgProjectDir(cwd, orgId, projectId), 'context.md');
}
function ensureDefaultLocalContextFile(cwd) {
    // Private per-repo context file (never committed because .neurcode is gitignored).
    const path = (0, path_1.join)(cwd, '.neurcode', 'context.md');
    if ((0, fs_1.existsSync)(path))
        return;
    try {
        const dir = (0, path_1.join)(cwd, '.neurcode');
        if (!(0, fs_1.existsSync)(dir))
            (0, fs_1.mkdirSync)(dir, { recursive: true });
        (0, gitignore_1.ensureNeurcodeInGitignore)(cwd);
        const template = [
            '# Neurcode Context (Local)',
            '',
            'This file is read by `neurcode plan` to improve relevance and consistency.',
            'Keep it short and factual. Bullet points work best.',
            '',
            '## Project Overview',
            '- (what this repo does)',
            '',
            '## Architecture / Invariants',
            '- (what must not change)',
            '',
            '## Conventions',
            '- (coding style, folder structure, naming, testing)',
            '',
            '## Notes',
            '- (local-only notes; not committed)',
            '',
        ].join('\n');
        (0, fs_1.writeFileSync)(path, `${template}\n`, 'utf-8');
    }
    catch {
        // ignore
    }
}
function loadStaticNeurcodeContext(cwd, filter) {
    const sources = [];
    const blocks = [];
    const addMd = (filePath, label) => {
        if (!(0, fs_1.existsSync)(filePath))
            return;
        try {
            const displayPath = (0, path_1.relative)(cwd, filePath) || filePath;
            const r = readUtf8Limited(filePath, { maxBytes: STATIC_MAX_BYTES_PER_FILE, mode: 'head' });
            sources.push({ path: displayPath, label, bytes: r.bytes, truncated: r.truncated, kind: 'md' });
            blocks.push({ label, path: displayPath, text: r.text });
        }
        catch {
            // ignore unreadable files
        }
    };
    const addJson = (filePath, label) => {
        if (!(0, fs_1.existsSync)(filePath))
            return;
        try {
            const displayPath = (0, path_1.relative)(cwd, filePath) || filePath;
            const r = readUtf8Limited(filePath, { maxBytes: STATIC_MAX_BYTES_PER_FILE, mode: 'head' });
            const parsed = safeParseJsonContext(r.text);
            if (!parsed)
                return;
            sources.push({ path: displayPath, label, bytes: r.bytes, truncated: r.truncated, kind: 'json' });
            blocks.push({ label, path: displayPath, text: parsed.text });
        }
        catch {
            // ignore
        }
    };
    // Repo-committable context
    addMd((0, path_1.join)(cwd, 'neurcode.md'), 'Repo Context');
    addJson((0, path_1.join)(cwd, 'neurcode.json'), 'Repo Context (JSON)');
    // Local private context (gitignored)
    addMd((0, path_1.join)(cwd, '.neurcode', 'context.md'), 'Local Context');
    addJson((0, path_1.join)(cwd, '.neurcode', 'context.json'), 'Local Context (JSON)');
    // Org+project scoped context (gitignored)
    if (filter?.orgId && filter?.projectId) {
        addMd(getOrgProjectContextPath(cwd, filter.orgId, filter.projectId), 'Org/Project Context');
        // Optional JSON variant if teams prefer structured config
        addJson((0, path_1.join)(getOrgProjectDir(cwd, filter.orgId, filter.projectId), 'context.json'), 'Org/Project Context (JSON)');
    }
    if (blocks.length === 0) {
        return { text: '', hash: sha256Hex(''), sources: [] };
    }
    // Enforce total limit deterministically (drop lowest-priority blocks from the end).
    // Priority order is already: repo -> local -> org/project, so dropping from end keeps the most stable context.
    let combined = combineContextBlocks(blocks);
    while (Buffer.byteLength(combined, 'utf-8') > STATIC_MAX_TOTAL_BYTES && blocks.length > 1) {
        blocks.pop();
        combined = combineContextBlocks(blocks);
    }
    return {
        text: combined,
        hash: sha256Hex(combined),
        sources,
    };
}
function loadOrgProjectMemoryTail(cwd, orgId, projectId) {
    const path = getOrgProjectMemoryPath(cwd, orgId, projectId);
    if (!(0, fs_1.existsSync)(path))
        return '';
    try {
        const r = readUtf8Limited(path, { maxBytes: MEMORY_TAIL_MAX_BYTES, mode: 'tail' });
        const tail = r.text.trim();
        if (!tail)
            return '';
        return [
            'NEURCODE MEMORY (recent local history; optional):',
            tail,
            '',
        ].join('\n');
    }
    catch {
        return '';
    }
}
function appendPlanToOrgProjectMemory(cwd, orgId, projectId, intent, response) {
    try {
        const dir = getOrgProjectDir(cwd, orgId, projectId);
        if (!(0, fs_1.existsSync)(dir))
            (0, fs_1.mkdirSync)(dir, { recursive: true });
        const path = getOrgProjectMemoryPath(cwd, orgId, projectId);
        let existing = '';
        if ((0, fs_1.existsSync)(path)) {
            existing = (0, fs_1.readFileSync)(path, 'utf-8');
        }
        else {
            existing = [
                '# Neurcode Memory (Org/Project)',
                '',
                'Auto-generated by Neurcode. This is local-only (gitignored).',
                'Keep entries concise; Neurcode will automatically trim older entries.',
                '',
            ].join('\n');
        }
        const now = new Date();
        const files = (response.plan.files || []).slice(0, 30).map((f) => `- ${f.action} ${f.path}`).join('\n');
        const summary = (0, secret_masking_1.maskSecretsInText)((response.plan.summary || '').trim()).masked.slice(0, 1500);
        const planId = response.planId || 'unknown';
        const safeIntent = (0, secret_masking_1.maskSecretsInText)(intent.trim()).masked;
        const entry = [
            MEMORY_ENTRY_MARKER,
            `## ${now.toISOString()}`,
            '',
            `Intent: ${safeIntent}`,
            `PlanId: ${planId}`,
            '',
            summary ? `Summary:\n${summary}` : 'Summary:\n(none)',
            '',
            files ? `Files:\n${files}` : 'Files:\n(none)',
            '',
        ].join('\n');
        let next = existing.trimEnd() + '\n\n' + entry;
        // Trim to last N entries.
        const parts = next.split(MEMORY_ENTRY_MARKER);
        if (parts.length > MEMORY_MAX_ENTRIES + 1) {
            const header = parts[0] || '';
            const tailParts = parts.slice(parts.length - MEMORY_MAX_ENTRIES);
            next = header.trimEnd() + '\n\n' + tailParts.map((p) => MEMORY_ENTRY_MARKER + p).join('');
        }
        (0, fs_1.writeFileSync)(path, next.trimEnd() + '\n', 'utf-8');
    }
    catch {
        // Memory persistence should never block the plan flow.
    }
}
//# sourceMappingURL=neurcode-context.js.map