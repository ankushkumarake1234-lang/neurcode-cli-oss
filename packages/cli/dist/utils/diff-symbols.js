"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDeclaredSymbolsFromDiff = extractDeclaredSymbolsFromDiff;
const SYMBOL_EXTENSIONS = new Set([
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.py',
    '.go',
]);
function normalizeRepoPath(value) {
    return value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
function extname(filePath) {
    const normalized = normalizeRepoPath(filePath);
    const lastSlash = normalized.lastIndexOf('/');
    const lastDot = normalized.lastIndexOf('.');
    if (lastDot <= lastSlash)
        return '';
    return normalized.slice(lastDot).toLowerCase();
}
function isSymbolCandidateFile(filePath) {
    const extension = extname(filePath);
    return SYMBOL_EXTENSIONS.has(extension);
}
function normalizeSymbolName(value) {
    return String(value || '')
        .trim()
        .replace(/^['"`]+|['"`]+$/g, '')
        .replace(/\(\)\s*$/, '');
}
function isValidIdentifier(value) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}
function stripInlineComments(line) {
    const hashIndex = line.indexOf('#');
    if (hashIndex >= 0 && !/["'`]/.test(line.slice(0, hashIndex))) {
        return line.slice(0, hashIndex);
    }
    const slashIndex = line.indexOf('//');
    if (slashIndex >= 0) {
        return line.slice(0, slashIndex);
    }
    return line;
}
const METHOD_RESERVED_NAMES = new Set([
    'if',
    'for',
    'while',
    'switch',
    'catch',
    'return',
    'else',
    'do',
    'try',
    'finally',
    'throw',
    'constructor',
]);
function extractDeclaredSymbolsFromLine(line) {
    const sanitizedLine = stripInlineComments(line);
    const matches = [];
    const seen = new Set();
    const push = (name, type) => {
        const normalized = normalizeSymbolName(name);
        if (!isValidIdentifier(normalized))
            return;
        const key = `${type}::${normalized}`;
        if (seen.has(key))
            return;
        seen.add(key);
        matches.push({ name: normalized, type });
    };
    const patternSpecs = [
        {
            type: 'class',
            regex: /^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/,
        },
        {
            type: 'class',
            regex: /^\s*(?:export\s+)?default\s+class(?:\s+([A-Za-z_$][A-Za-z0-9_$]*))?\b/,
            resolver: (match) => (match[1] ? match[1] : 'default'),
        },
        {
            type: 'interface',
            regex: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/,
        },
        {
            type: 'type',
            regex: /^\s*(?:export\s+)?type\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/,
        },
        {
            type: 'function',
            regex: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/,
        },
        {
            type: 'function',
            regex: /^\s*(?:export\s+)?default\s+(?:async\s+)?function\s*\(/,
            resolver: () => 'default',
        },
        {
            type: 'function',
            regex: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/,
        },
        {
            type: 'function',
            regex: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?function\b/,
        },
        {
            type: 'method',
            regex: /^\s*(?:public|private|protected|readonly|static|async|get|set|\s)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^;{}]*\)\s*\{/,
            resolver: (match) => {
                const candidate = match[1] || null;
                if (!candidate)
                    return null;
                if (METHOD_RESERVED_NAMES.has(candidate))
                    return null;
                return candidate;
            },
        },
        {
            type: 'method',
            regex: /^\s*(?:public|private|protected|readonly|static)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/,
        },
        {
            type: 'class',
            regex: /^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\s*[\(:]/,
        },
        {
            type: 'function',
            regex: /^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
        },
        {
            type: 'function',
            regex: /^\s*func\s+(?:\([^)]+\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
        },
    ];
    for (const spec of patternSpecs) {
        const match = sanitizedLine.match(spec.regex);
        if (!match)
            continue;
        const resolved = spec.resolver ? spec.resolver(match) : match[1] || null;
        if (resolved) {
            push(resolved, spec.type);
        }
    }
    return matches;
}
function extractDeclaredSymbolsFromDiff(diffFiles) {
    const counters = new Map();
    for (const file of diffFiles) {
        const normalizedPath = normalizeRepoPath(file.path);
        if (!normalizedPath || !isSymbolCandidateFile(normalizedPath))
            continue;
        for (const hunk of file.hunks || []) {
            const hasDelta = (hunk.lines || []).some((line) => line.type === 'added' || line.type === 'removed');
            if (!hasDelta)
                continue;
            for (const line of hunk.lines || []) {
                if (line.type !== 'added' && line.type !== 'removed' && line.type !== 'context')
                    continue;
                const declared = extractDeclaredSymbolsFromLine(line.content);
                if (declared.length === 0)
                    continue;
                for (const symbol of declared) {
                    const key = `${normalizedPath}::${symbol.type}::${symbol.name}`;
                    const current = counters.get(key) || {
                        file: normalizedPath,
                        name: symbol.name,
                        type: symbol.type,
                        added: 0,
                        removed: 0,
                        context: 0,
                    };
                    if (line.type === 'added')
                        current.added += 1;
                    if (line.type === 'removed')
                        current.removed += 1;
                    if (line.type === 'context')
                        current.context += 1;
                    counters.set(key, current);
                }
            }
        }
    }
    const changes = [];
    for (const item of counters.values()) {
        let action = 'delete';
        if (item.added > 0 && item.removed > 0) {
            action = 'modify';
        }
        else if (item.added > 0) {
            action = 'add';
        }
        else if (item.removed === 0 && item.context > 0) {
            action = 'modify';
        }
        changes.push({
            name: item.name,
            type: item.type,
            action,
            file: item.file,
        });
    }
    return changes.sort((a, b) => {
        if (a.file !== b.file)
            return a.file.localeCompare(b.file);
        if (a.name !== b.name)
            return a.name.localeCompare(b.name);
        return a.type.localeCompare(b.type);
    });
}
//# sourceMappingURL=diff-symbols.js.map