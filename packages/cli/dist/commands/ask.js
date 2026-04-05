"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.askCommand = askCommand;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const config_1 = require("../config");
const project_root_1 = require("../utils/project-root");
const state_1 = require("../utils/state");
const neurcode_context_1 = require("../utils/neurcode-context");
const scope_telemetry_1 = require("../utils/scope-telemetry");
const plan_cache_1 = require("../utils/plan-cache");
const brain_context_1 = require("../utils/brain-context");
const ask_cache_1 = require("../utils/ask-cache");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (str) => str,
        yellow: (str) => str,
        red: (str) => str,
        bold: (str) => str,
        dim: (str) => str,
        cyan: (str) => str,
        white: (str) => str,
    };
}
const MAX_SCAN_FILES = (() => {
    const raw = Number(process.env.NEURCODE_ASK_MAX_SCAN_FILES || '2200');
    if (!Number.isFinite(raw))
        return 2200;
    return Math.max(300, Math.min(Math.trunc(raw), 8000));
})();
const MAX_FILE_BYTES = 512 * 1024;
const MAX_RAW_CITATIONS = 220;
const RG_MAX_MATCHES = 3500;
const FETCH_TIMEOUT_MS = (() => {
    const raw = Number(process.env.NEURCODE_ASK_EXTERNAL_TIMEOUT_MS || '9000');
    if (!Number.isFinite(raw))
        return 9000;
    return Math.max(3000, Math.min(Math.trunc(raw), 30000));
})();
const REPO_SCOPE_TERMS = new Set([
    'repo', 'repository', 'codebase', 'file', 'files', 'path', 'paths', 'module', 'modules',
    'function', 'class', 'interface', 'type', 'schema', 'command', 'commands', 'flag', 'option',
    'middleware', 'route', 'service', 'api', 'org', 'organization', 'tenant', 'tenancy',
    'plan', 'verify', 'ask', 'ship', 'apply', 'watch', 'session', 'cache', 'brain', 'diff',
]);
const EXTERNAL_WORLD_TERMS = new Set([
    'capital', 'population', 'gdp', 'weather', 'temperature', 'forecast', 'stock', 'price',
    'exchange', 'currency', 'president', 'prime minister', 'news', 'election', 'sports',
    'bitcoin', 'btc', 'ethereum', 'eth', 'usd', 'eur', 'inr', 'jpy',
    'fifa', 'world cup', 'olympics', 'cricket', 'nba', 'nfl',
]);
const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'what', 'where', 'when', 'which',
    'from', 'your', 'about', 'there', 'their', 'them', 'have', 'does', 'is', 'are', 'was',
    'were', 'any', 'all', 'tell', 'me', 'its', 'it', 'than', 'then', 'workflow', 'codebase',
    'repo', 'repository', 'used', 'use', 'using', 'list', 'show', 'like', 'can', 'type',
    'types', 'package', 'packages', 'give', 'need', 'please', 'how', 'work', 'works', 'working',
]);
const LOW_SIGNAL_TERMS = new Set([
    'used', 'use', 'using', 'where', 'tell', 'read', 'check', 'find', 'search',
    'workflow', 'repo', 'repository', 'codebase', 'anywhere', 'can', 'type', 'types',
    'list', 'show', 'like', 'neurcode', 'cli', 'file', 'files', 'path', 'paths',
    'resolved', 'resolve', 'defined', 'define', 'implemented', 'implement', 'called', 'call',
    'how', 'work', 'works', 'working',
]);
const SUBCOMMAND_STOP_TERMS = new Set([
    'command', 'commands', 'subcommand', 'subcommands',
    'option', 'options', 'flag', 'flags',
    'what', 'where', 'when', 'why', 'who', 'which', 'how',
    'does', 'do', 'did', 'can', 'could', 'should', 'would', 'will',
    'work', 'works', 'working', 'flow', 'trace', 'compute', 'computed',
    'implementation', 'implement', 'internals', 'logic', 'behavior', 'behaviour',
]);
const CLI_COMMAND_NAMES = new Set([
    'check', 'refactor', 'security', 'brain', 'login', 'logout', 'init', 'doctor',
    'whoami', 'config', 'map', 'ask', 'plan', 'ship', 'apply', 'allow', 'watch',
    'session', 'verify', 'prompt', 'revert',
]);
function normalizeFilePath(filePath) {
    return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}
function isIgnoredSearchPath(path) {
    const normalized = normalizeFilePath(path).toLowerCase();
    if (!normalized)
        return true;
    if (normalized.startsWith('dist/') ||
        normalized.includes('/dist/') ||
        normalized.startsWith('build/') ||
        normalized.includes('/build/') ||
        normalized.startsWith('out/') ||
        normalized.includes('/out/') ||
        normalized.startsWith('.next/') ||
        normalized.includes('/.next/')) {
        return true;
    }
    if (normalized.includes('.pnpm-store/') ||
        normalized.startsWith('node_modules/') ||
        normalized.includes('/node_modules/') ||
        normalized.startsWith('.git/') ||
        normalized.includes('/.git/') ||
        normalized.startsWith('.neurcode/') ||
        normalized.includes('/.neurcode/') ||
        normalized.includes('/coverage/') ||
        normalized.includes('/.cache/') ||
        normalized.endsWith('.min.js') ||
        normalized.endsWith('.map')) {
        return true;
    }
    return false;
}
function escapeRegExp(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function normalizeSnippet(line) {
    return line
        .replace(/\t/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 260);
}
function buildQueryProfile(searchTerms) {
    const normalizedQuestion = searchTerms.normalizedQuestion;
    const commandFocus = detectCommandFocus(normalizedQuestion);
    return {
        asksLocation: /\b(where|which file|location|defined|implemented|called|computed|resolved)\b/.test(normalizedQuestion),
        asksHow: /\b(how|flow|trace|explain|why)\b/.test(normalizedQuestion),
        asksList: /\b(list|show|which|what)\b/.test(normalizedQuestion),
        asksRegistration: /\b(register|registered|registration|mapped|wired|hooked)\b/.test(normalizedQuestion),
        codeFocused: /\b(command|commands|flag|option|api|middleware|route|service|class|function|interface|type|schema|field|cache|tenant|org|auth|verify|plan|apply|ship)\b/.test(normalizedQuestion),
        commandFocus,
        subcommandFocus: detectSubcommandFocus(normalizedQuestion, commandFocus),
        highSignalSet: new Set(searchTerms.highSignalTerms.map((term) => term.toLowerCase())),
    };
}
function isLikelyDocumentationPath(path) {
    const normalized = normalizeFilePath(path).toLowerCase();
    if (!normalized)
        return false;
    if (normalized === 'readme.md' || normalized.endsWith('/readme.md'))
        return true;
    if (normalized.startsWith('docs/') || normalized.includes('/docs/'))
        return true;
    if (normalized.includes('/documentation/'))
        return true;
    if (normalized.includes('/sitemap'))
        return true;
    if (normalized.endsWith('.md') || normalized.endsWith('.mdx'))
        return true;
    return false;
}
function isLikelyCodeSnippet(snippet) {
    const value = snippet.trim();
    if (!value)
        return false;
    if (/^\s*\/[/*]/.test(value))
        return true;
    if (/[{}();=]/.test(value))
        return true;
    if (/\b(import|export|const|let|var|function|class|interface|type|enum|return|await|if|else|switch|case|try|catch|throw)\b/.test(value)) {
        return true;
    }
    if (/\b[a-zA-Z_][a-zA-Z0-9_]*\s*\(/.test(value))
        return true;
    if (/\.\w+\(/.test(value))
        return true;
    if (/=>/.test(value))
        return true;
    return false;
}
function isLikelyDocSnippet(snippet) {
    const value = snippet.trim();
    if (!value)
        return false;
    if (/^<\w+/.test(value) || /<\/\w+>/.test(value))
        return true;
    if (/\b(className|href|to: ['"]\/docs\/|#ask-command)\b/.test(value))
        return true;
    if (/^#{1,6}\s/.test(value))
        return true;
    if (/^[-*]\s/.test(value))
        return true;
    return false;
}
function isPromptExampleSnippet(snippet, normalizedQuestion, highSignalTerms) {
    const snippetLower = snippet.toLowerCase();
    if (!snippetLower)
        return false;
    if (/\bneurcode\s+(ask|plan|verify|ship|apply)\s+["`]/i.test(snippet))
        return true;
    if (snippetLower.includes('?') && /\b(where|what|how|why|which)\b/.test(snippetLower)) {
        const overlaps = highSignalTerms.filter((term) => term && snippetLower.includes(term.toLowerCase())).length;
        if (overlaps >= Math.min(3, Math.max(2, highSignalTerms.length)))
            return true;
    }
    const normalizedSnippet = (0, plan_cache_1.normalizeIntent)(snippetLower);
    if (normalizedQuestion.length >= 24 && normalizedSnippet.includes(normalizedQuestion.slice(0, 28))) {
        return true;
    }
    return false;
}
function tokenizeQuestion(question) {
    return (0, plan_cache_1.normalizeIntent)(question)
        .replace(/[^a-z0-9_\-\s]/g, ' ')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}
function extractQuotedPhrases(question) {
    const out = [];
    const seen = new Set();
    const re = /["'`](.{2,100}?)["'`]/g;
    for (const match of question.matchAll(re)) {
        const value = (0, plan_cache_1.normalizeIntent)(match[1] || '').trim();
        if (!value || seen.has(value))
            continue;
        seen.add(value);
        out.push(value);
    }
    return out;
}
function extractCodeIdentifiers(question) {
    const matches = question.match(/[A-Za-z_][A-Za-z0-9_\-]{2,}/g) || [];
    const out = [];
    const seen = new Set();
    for (const token of matches) {
        const normalized = token.trim();
        const key = normalized.toLowerCase();
        if (!normalized || STOP_WORDS.has(key))
            continue;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(normalized);
    }
    return out.slice(0, 16);
}
function buildSearchTerms(question) {
    const normalizedQuestion = (0, plan_cache_1.normalizeIntent)(question);
    const tokens = tokenizeQuestion(question);
    const quotedPhrases = extractQuotedPhrases(question);
    const identifiers = extractCodeIdentifiers(question);
    const highSignalTerms = tokens
        .filter((token) => !LOW_SIGNAL_TERMS.has(token))
        .slice(0, 18);
    const phraseTerms = [];
    for (let i = 0; i < highSignalTerms.length - 1; i++) {
        const phrase = `${highSignalTerms[i]} ${highSignalTerms[i + 1]}`;
        if (phrase.length >= 7)
            phraseTerms.push(phrase);
        if (phraseTerms.length >= 8)
            break;
    }
    const all = [
        ...quotedPhrases,
        ...identifiers,
        ...highSignalTerms,
        ...phraseTerms,
    ];
    const seen = new Set();
    const rgTerms = [];
    for (const term of all) {
        const normalized = (0, plan_cache_1.normalizeIntent)(term).trim();
        if (!normalized)
            continue;
        if (seen.has(normalized))
            continue;
        seen.add(normalized);
        rgTerms.push(normalized);
    }
    return {
        normalizedQuestion,
        tokens,
        highSignalTerms,
        quotedPhrases,
        identifiers,
        rgTerms: rgTerms.slice(0, 22),
    };
}
function scanFiles(dir, maxFiles = MAX_SCAN_FILES) {
    const files = [];
    const ignoreDirs = new Set([
        'node_modules', '.git', '.next', 'dist', 'build', '.turbo', '.cache',
        'coverage', '.neurcode', '.vscode', '.pnpm-store', '.yarn', '.npm',
    ]);
    const ignoreExts = new Set([
        'map', 'log', 'lock', 'png', 'jpg', 'jpeg', 'gif', 'ico', 'svg',
        'woff', 'woff2', 'ttf', 'eot', 'pdf',
    ]);
    const walk = (current) => {
        if (files.length >= maxFiles)
            return;
        let entries = [];
        try {
            entries = (0, fs_1.readdirSync)(current);
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (files.length >= maxFiles)
                break;
            const fullPath = (0, path_1.join)(current, entry);
            let st;
            try {
                st = (0, fs_1.statSync)(fullPath);
            }
            catch {
                continue;
            }
            if (st.isDirectory()) {
                if (ignoreDirs.has(entry))
                    continue;
                if (entry.startsWith('.') && entry !== '.env')
                    continue;
                walk(fullPath);
                continue;
            }
            if (!st.isFile())
                continue;
            if (st.size > MAX_FILE_BYTES)
                continue;
            const ext = entry.includes('.') ? entry.split('.').pop()?.toLowerCase() || '' : '';
            if (ext && ignoreExts.has(ext))
                continue;
            const rel = normalizeFilePath(fullPath.slice(dir.length + 1));
            files.push(rel);
        }
    };
    walk(dir);
    return files.slice(0, maxFiles);
}
function countTermHits(text, terms) {
    if (!text || terms.length === 0)
        return 0;
    let hits = 0;
    const lower = text.toLowerCase();
    for (const term of terms) {
        const normalized = term.toLowerCase().trim();
        if (!normalized)
            continue;
        if (normalized.includes(' ')) {
            if (lower.includes(normalized))
                hits += 1;
            continue;
        }
        const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(normalized)}(?:$|[^a-z0-9])`, 'i');
        if (pattern.test(lower))
            hits += 1;
    }
    return hits;
}
function classifyQuestionScope(question, terms) {
    const normalized = terms.normalizedQuestion;
    const repoSignal = countTermHits(normalized, [...REPO_SCOPE_TERMS]);
    const externalSignal = countTermHits(normalized, [...EXTERNAL_WORLD_TERMS]);
    const hasCodeLikeSyntax = /[`][^`]+[`]/.test(question) ||
        /\b[a-z0-9_\-/]+\.(ts|tsx|js|jsx|py|go|java|rb|php|cs|json|yml|yaml|toml|sql|md)\b/i.test(question) ||
        /\b[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(question) ||
        /--[a-z0-9-]+/i.test(question);
    const mentionsKnownCommand = [...CLI_COMMAND_NAMES].some((cmd) => new RegExp(`\\b${escapeRegExp(cmd)}\\b`, 'i').test(normalized));
    const asksGlobalFact = /\b(capital|population|gdp|weather|forecast|stock|currency|exchange rate|president|prime minister|who is|who was|who won|what is|where is|when did|world cup|olympics|fifa|nba|nfl|cricket)\b/.test(normalized);
    if ((externalSignal >= 1 || asksGlobalFact) && repoSignal === 0 && !hasCodeLikeSyntax && !mentionsKnownCommand) {
        return {
            kind: 'external',
            reasons: ['Question appears to be outside repository scope.'],
        };
    }
    if (repoSignal > 0 || hasCodeLikeSyntax || mentionsKnownCommand) {
        return { kind: 'repo', reasons: [] };
    }
    return {
        kind: 'ambiguous',
        reasons: ['Question does not clearly reference repository context.'],
    };
}
function detectCommandFocus(normalizedQuestion) {
    const compound = normalizedQuestion.match(/\b([a-z][a-z0-9-]*)\s+([a-z][a-z0-9-]*)\s+command\b/);
    if (compound?.[1] && CLI_COMMAND_NAMES.has(compound[1])) {
        return compound[1];
    }
    const direct = normalizedQuestion.match(/\bneurcode\s+([a-z][a-z0-9-]*)\b/);
    if (direct?.[1] && CLI_COMMAND_NAMES.has(direct[1])) {
        return direct[1];
    }
    const singular = normalizedQuestion.match(/\b([a-z][a-z0-9-]*)\s+command\b/);
    if (singular?.[1] && CLI_COMMAND_NAMES.has(singular[1])) {
        return singular[1];
    }
    const mentioned = [...CLI_COMMAND_NAMES].filter((cmd) => new RegExp(`\\b${escapeRegExp(cmd)}\\b`, 'i').test(normalizedQuestion));
    if (mentioned.length === 1)
        return mentioned[0];
    return null;
}
function isLikelySubcommandToken(value, options) {
    const token = (0, plan_cache_1.normalizeIntent)(value).trim().toLowerCase();
    if (!token || token.length < 3)
        return false;
    if (!/^[a-z][a-z0-9-]*$/.test(token))
        return false;
    if (!options?.allowKnownCommand && CLI_COMMAND_NAMES.has(token))
        return false;
    if (STOP_WORDS.has(token) || LOW_SIGNAL_TERMS.has(token) || SUBCOMMAND_STOP_TERMS.has(token))
        return false;
    return true;
}
function detectSubcommandFocus(normalizedQuestion, commandFocus) {
    if (!commandFocus)
        return null;
    const explicit = normalizedQuestion.match(new RegExp(`\\b${escapeRegExp(commandFocus)}\\s+([a-z][a-z0-9-]*)\\s+command\\b`));
    if (explicit?.[1] && isLikelySubcommandToken(explicit[1], { allowKnownCommand: true })) {
        return explicit[1].toLowerCase();
    }
    const directAfter = normalizedQuestion.match(new RegExp(`\\b${escapeRegExp(commandFocus)}\\s+([a-z][a-z0-9-]*)\\b`));
    if (directAfter?.[1] && isLikelySubcommandToken(directAfter[1])) {
        return directAfter[1].toLowerCase();
    }
    const explicitSubcommand = normalizedQuestion.match(new RegExp(`\\b([a-z][a-z0-9-]*)\\s+subcommand\\b.*\\b${escapeRegExp(commandFocus)}\\b`));
    if (explicitSubcommand?.[1] && isLikelySubcommandToken(explicitSubcommand[1])) {
        return explicitSubcommand[1].toLowerCase();
    }
    return null;
}
function parseOwnershipLookbackDays(normalizedQuestion) {
    if (/\bquarter\b/.test(normalizedQuestion))
        return 120;
    if (/\bhalf[-\s]?year\b/.test(normalizedQuestion))
        return 180;
    if (/\byear\b/.test(normalizedQuestion))
        return 365;
    if (/\bmonth\b/.test(normalizedQuestion))
        return 30;
    if (/\bweek\b/.test(normalizedQuestion))
        return 14;
    const explicitDays = normalizedQuestion.match(/\b(\d{1,4})\s*days?\b/);
    if (explicitDays) {
        const parsed = Number(explicitDays[1]);
        if (Number.isFinite(parsed))
            return Math.max(1, Math.min(parsed, 3650));
    }
    return 90;
}
function buildOwnershipDeterministicAnswer(cwd, question, normalizedQuestion) {
    const asksOwnership = /\b(who|owner|owners|authored|touched|touch)\b/.test(normalizedQuestion);
    if (!asksOwnership)
        return null;
    const repoSignal = countTermHits(normalizedQuestion, [...REPO_SCOPE_TERMS]);
    const externalSignal = countTermHits(normalizedQuestion, [...EXTERNAL_WORLD_TERMS]);
    const hasCodeLikeSyntax = /[`][^`]+[`]/.test(question) ||
        /\b[a-z0-9_\-/]+\.(ts|tsx|js|jsx|py|go|java|rb|php|cs|json|yml|yaml|toml|sql|md)\b/i.test(question) ||
        /\b[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(question) ||
        /--[a-z0-9-]+/i.test(question);
    const ownershipExternalPattern = /\b(who won|who is|who was|world cup|olympics|fifa|nba|nfl|cricket)\b/.test(normalizedQuestion);
    if ((repoSignal === 0 && !hasCodeLikeSyntax) || ownershipExternalPattern || externalSignal > 0) {
        return null;
    }
    const ignoreTerms = new Set([
        'who', 'owner', 'owners', 'authored', 'touched', 'touch', 'last', 'quarter',
        'recent', 'recently', 'file', 'files', 'module', 'modules', 'repo', 'repository',
        'codebase', 'this', 'that', 'these', 'those', 'for', 'from', 'with', 'about',
        'during', 'before', 'after', 'show', 'list', 'what', 'which', 'where',
    ]);
    const focusTerms = (0, plan_cache_1.normalizeIntent)(question)
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 4 && !ignoreTerms.has(term));
    const sinceDays = parseOwnershipLookbackDays(normalizedQuestion);
    const result = (0, child_process_1.spawnSync)('git', ['log', `--since=${sinceDays}.days`, '--name-only', '--pretty=format:__AUTHOR__%an'], {
        cwd,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 60,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    if ((result.status ?? 1) !== 0 || !result.stdout) {
        return null;
    }
    const authorTouches = new Map();
    const fileTouches = new Map();
    let currentAuthor = '';
    for (const rawLine of result.stdout.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line)
            continue;
        if (line.startsWith('__AUTHOR__')) {
            currentAuthor = line.replace('__AUTHOR__', '').trim() || 'Unknown';
            continue;
        }
        if (!currentAuthor)
            continue;
        const normalizedPath = normalizeFilePath(line);
        if (!normalizedPath || isIgnoredSearchPath(normalizedPath)) {
            continue;
        }
        if (focusTerms.length > 0 && !focusTerms.some((term) => (0, plan_cache_1.normalizeIntent)(normalizedPath).includes(term))) {
            continue;
        }
        authorTouches.set(currentAuthor, (authorTouches.get(currentAuthor) || 0) + 1);
        const byFile = fileTouches.get(normalizedPath) || new Map();
        byFile.set(currentAuthor, (byFile.get(currentAuthor) || 0) + 1);
        fileTouches.set(normalizedPath, byFile);
    }
    if (authorTouches.size === 0)
        return null;
    const topContributors = [...authorTouches.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([author, touches]) => ({ author, touches }));
    const topFiles = [...fileTouches.entries()]
        .sort((a, b) => {
        const aCount = [...a[1].values()].reduce((sum, n) => sum + n, 0);
        const bCount = [...b[1].values()].reduce((sum, n) => sum + n, 0);
        return bCount - aCount;
    })
        .slice(0, 6);
    const targetLabel = focusTerms.length > 0 ? `files matching "${focusTerms.slice(0, 4).join(', ')}"` : 'this repository';
    const citations = topFiles.map(([path, owners]) => {
        const summary = [...owners.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([author, touches]) => `${author}(${touches})`)
            .join(', ');
        return {
            path,
            line: 1,
            term: focusTerms[0] || 'authorship',
            snippet: `Recent git touches (last ${sinceDays}d): ${summary}`,
        };
    });
    const sourceFiles = new Set(citations.map((c) => c.path)).size;
    return {
        question,
        questionNormalized: normalizedQuestion,
        mode: 'search',
        answer: [
            `I checked local git history for the last ${sinceDays} day(s).`,
            `Top contributors for ${targetLabel}:`,
            ...topContributors.map((entry) => `  • ${entry.author} (${entry.touches} touches)`),
        ].join('\n'),
        findings: [
            `Derived from git history over ${sinceDays} day(s).`,
            `Focus: ${targetLabel}.`,
        ],
        confidence: topContributors.length >= 2 ? 'high' : 'medium',
        proof: {
            topFiles: [...new Set(citations.map((citation) => citation.path))].slice(0, 5),
            evidenceCount: citations.length,
            coverage: {
                sourceCitations: citations.length,
                sourceFiles,
                matchedFiles: sourceFiles,
                matchedLines: citations.length,
            },
        },
        truth: {
            status: 'grounded',
            score: Math.min(0.98, 0.66 + Math.min(sourceFiles, 6) * 0.05),
            reasons: ['Answer is grounded in local git history.'],
            sourceCitations: citations.length,
            sourceFiles,
            minCitationsRequired: 1,
            minFilesRequired: 1,
        },
        citations,
        generatedAt: new Date().toISOString(),
        stats: {
            scannedFiles: 0,
            matchedFiles: sourceFiles,
            matchedLines: citations.length,
            brainCandidates: 0,
        },
    };
}
function buildCommandRegistrationDeterministicAnswer(cwd, question, searchTerms, maxCitations) {
    const profile = buildQueryProfile(searchTerms);
    if (!profile.asksRegistration || !profile.commandFocus)
        return null;
    const commandName = profile.commandFocus;
    const handlerName = `${commandName}Command`;
    const directPattern = `\\.command\\(['"\`]${escapeRegExp(commandName)}['"\`]\\)`;
    const handlerPattern = `\\b${escapeRegExp(handlerName)}\\b`;
    const handlerCallPattern = `\\b(?:await\\s+)?${escapeRegExp(handlerName)}\\s*\\(`;
    const rawMatches = [
        ...runRipgrepSearch(cwd, directPattern),
        ...runRipgrepSearch(cwd, handlerCallPattern),
        ...runRipgrepSearch(cwd, handlerPattern),
    ];
    if (rawMatches.length === 0)
        return null;
    const dedup = new Map();
    const directRegex = new RegExp(directPattern, 'i');
    const handlerRegex = new RegExp(handlerPattern, 'i');
    const handlerCallRegex = new RegExp(handlerCallPattern, 'i');
    for (const match of rawMatches) {
        if (isIgnoredSearchPath(match.path))
            continue;
        if (isLikelyDocumentationPath(match.path))
            continue;
        let score = 0.45;
        if (directRegex.test(match.snippet))
            score += 7.2;
        if (handlerCallRegex.test(match.snippet))
            score += 3.2;
        if (handlerRegex.test(match.snippet))
            score += 1.4;
        const pathLower = match.path.toLowerCase();
        if (pathLower === 'packages/cli/src/index.ts')
            score += 4.6;
        if (pathLower.includes(`/commands/${commandName}.`))
            score += 2.8;
        if (pathLower.includes('/commands/'))
            score += 0.55;
        if (/\.action\(/.test(match.snippet))
            score += 1.1;
        if (/^\s*import\s+/.test(match.snippet))
            score += 0.7;
        if (score <= 0)
            continue;
        const key = `${match.path}:${match.line}`;
        const next = {
            path: match.path,
            line: match.line,
            snippet: match.snippet,
            term: commandName,
            score,
            matchedTerms: [commandName],
        };
        const existing = dedup.get(key);
        if (!existing || next.score > existing.score) {
            dedup.set(key, next);
        }
    }
    const scored = [...dedup.values()].sort((a, b) => b.score - a.score);
    if (scored.length === 0)
        return null;
    const citations = selectTopCitations(scored, Math.min(maxCitations, 10), searchTerms);
    if (citations.length === 0)
        return null;
    const directCitations = citations.filter((citation) => directRegex.test(citation.snippet));
    const sourceFiles = new Set(citations.map((citation) => citation.path)).size;
    const topFiles = [...new Set(citations.map((citation) => citation.path))].slice(0, 5);
    const answerLines = [];
    if (directCitations.length > 0) {
        const first = directCitations[0];
        answerLines.push(`The \`${commandName}\` command is registered at ${first.path}:${first.line}.`);
        answerLines.push('Supporting wiring references:');
        for (const citation of citations.slice(0, 5)) {
            answerLines.push(`  • ${citation.path}:${citation.line} — ${normalizeSnippet(citation.snippet)}`);
        }
    }
    else {
        answerLines.push(`I found related wiring for \`${commandName}\`, but no direct \`.command('${commandName}')\` line yet.`);
        answerLines.push('Closest references:');
        for (const citation of citations.slice(0, 5)) {
            answerLines.push(`  • ${citation.path}:${citation.line} — ${normalizeSnippet(citation.snippet)}`);
        }
    }
    const truthStatus = directCitations.length > 0 ? 'grounded' : 'insufficient';
    const truthScore = directCitations.length > 0
        ? Math.min(0.98, 0.74 + Math.min(citations.length, 6) * 0.03)
        : 0.33;
    return {
        question,
        questionNormalized: searchTerms.normalizedQuestion,
        mode: 'search',
        answer: answerLines.join('\n'),
        findings: [
            `Direct registration hits: ${directCitations.length}.`,
            `Total wiring citations: ${citations.length} across ${sourceFiles} file(s).`,
        ],
        confidence: truthStatus === 'grounded' ? 'high' : 'low',
        proof: {
            topFiles,
            evidenceCount: citations.length,
            coverage: {
                sourceCitations: citations.length,
                sourceFiles,
                matchedFiles: sourceFiles,
                matchedLines: citations.length,
            },
        },
        truth: {
            status: truthStatus,
            score: Number(truthScore.toFixed(2)),
            reasons: truthStatus === 'grounded'
                ? ['Command registration is grounded in direct command declaration evidence.']
                : [`No direct \`.command('${commandName}')\` declaration was found.`],
            sourceCitations: citations.length,
            sourceFiles,
            minCitationsRequired: 1,
            minFilesRequired: 1,
        },
        citations,
        generatedAt: new Date().toISOString(),
        stats: {
            scannedFiles: 0,
            matchedFiles: sourceFiles,
            matchedLines: citations.length,
            brainCandidates: 0,
        },
    };
}
function buildCommandInventoryDeterministicAnswer(cwd, question, searchTerms, maxCitations) {
    const normalized = searchTerms.normalizedQuestion;
    const asksInventory = /\b(list|show|what|which)\b/.test(normalized) &&
        /\bcommands?\b/.test(normalized) &&
        /\b(neurcode|cli|available|all)\b/.test(normalized);
    if (!asksInventory)
        return null;
    const matches = runRipgrepSearch(cwd, `\\.command\\(['"\`][a-z][a-z0-9-]*['"\`]\\)`)
        .filter((row) => !isIgnoredSearchPath(row.path))
        .filter((row) => !isLikelyDocumentationPath(row.path))
        .filter((row) => normalizeFilePath(row.path) === 'packages/cli/src/index.ts');
    if (matches.length === 0)
        return null;
    const byCommand = new Map();
    for (const row of matches.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)) {
        const match = row.snippet.match(/\.command\(['"`]([a-z][a-z0-9-]*)['"`]\)/i);
        if (!match?.[1])
            continue;
        const command = match[1].trim().toLowerCase();
        if (!command || byCommand.has(command))
            continue;
        byCommand.set(command, {
            path: row.path,
            line: row.line,
            term: command,
            snippet: row.snippet,
        });
    }
    const commands = [...byCommand.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]));
    if (commands.length === 0)
        return null;
    const citations = commands
        .slice(0, Math.max(6, Math.min(maxCitations, 30)))
        .map(([, citation]) => citation);
    const sourceFiles = new Set(citations.map((citation) => citation.path)).size;
    const topFiles = [...new Set(citations.map((citation) => citation.path))].slice(0, 5);
    const answerLines = [
        `I found ${commands.length} Neurcode CLI command registrations in this repository.`,
        'Top commands and registration points:',
        ...commands.slice(0, 14).map(([command, citation]) => `  • ${command} — ${citation.path}:${citation.line}`),
        '',
        'If you want, ask `where is <command> command registered` for wiring details.',
    ];
    return {
        question,
        questionNormalized: normalized,
        mode: 'search',
        answer: answerLines.join('\n'),
        findings: [
            `Detected ${commands.length} command registration(s).`,
            `Evidence spans ${sourceFiles} file(s).`,
        ],
        confidence: 'high',
        proof: {
            topFiles,
            evidenceCount: citations.length,
            coverage: {
                sourceCitations: citations.length,
                sourceFiles,
                matchedFiles: sourceFiles,
                matchedLines: citations.length,
            },
        },
        truth: {
            status: 'grounded',
            score: 0.93,
            reasons: ['Command list is grounded in direct `.command(...)` declarations.'],
            sourceCitations: citations.length,
            sourceFiles,
            minCitationsRequired: 1,
            minFilesRequired: 1,
        },
        citations,
        generatedAt: new Date().toISOString(),
        stats: {
            scannedFiles: 0,
            matchedFiles: sourceFiles,
            matchedLines: citations.length,
            brainCandidates: 0,
        },
    };
}
function collectCommandSubcommandBlockEvidence(cwd, commandPath, subcommand, searchTerms, maxCitations) {
    const fullPath = (0, path_1.join)(cwd, commandPath);
    if (!(0, fs_1.existsSync)(fullPath))
        return null;
    let content = '';
    try {
        content = (0, fs_1.readFileSync)(fullPath, 'utf-8');
    }
    catch {
        return null;
    }
    const lines = content.split(/\r?\n/);
    const subcommandDeclRegex = new RegExp(`\\.command\\(['"\`]${escapeRegExp(subcommand)}(?:\\s+\\[[^\\]]+\\])?['"\`]\\)`, 'i');
    const anchorIdx = lines.findIndex((line) => subcommandDeclRegex.test(line));
    if (anchorIdx < 0)
        return null;
    let endIdx = lines.length;
    for (let i = anchorIdx + 1; i < lines.length; i++) {
        if (/^\s*\.command\(['"`][a-z][a-z0-9-]*(?:\s+\[[^\]]+\])?['"`]\)/i.test(lines[i])) {
            endIdx = i;
            break;
        }
    }
    const relevantTerms = [...searchTerms.highSignalTerms, ...searchTerms.identifiers]
        .map((term) => (0, plan_cache_1.normalizeIntent)(term))
        .filter((term) => term.length >= 3 && !LOW_SIGNAL_TERMS.has(term) && term !== subcommand)
        .slice(0, 14);
    let focusRegex = null;
    const focusPattern = buildPatternFromTerms(relevantTerms);
    if (focusPattern) {
        try {
            focusRegex = new RegExp(focusPattern, 'i');
        }
        catch {
            focusRegex = null;
        }
    }
    const citations = [];
    const seen = new Set();
    const pushLine = (lineIdx, term) => {
        if (lineIdx < 0 || lineIdx >= lines.length)
            return;
        const snippet = normalizeSnippet(lines[lineIdx] || '');
        if (!snippet)
            return;
        const key = `${commandPath}:${lineIdx + 1}`;
        if (seen.has(key))
            return;
        seen.add(key);
        citations.push({
            path: commandPath,
            line: lineIdx + 1,
            term,
            snippet,
        });
    };
    pushLine(anchorIdx, subcommand);
    for (let i = anchorIdx; i < endIdx; i++) {
        if (citations.length >= maxCitations)
            break;
        const snippet = normalizeSnippet(lines[i] || '');
        if (!snippet)
            continue;
        const isAction = /\.action\(/.test(snippet);
        const isDescription = /\.description\(/.test(snippet);
        const hasFocus = focusRegex ? focusRegex.test(snippet) : false;
        const hasFlowCall = /\b(?:get|load|read|list|compute|count|find|search|refresh|record|write|print|format|clear|delete|close|set)[A-Za-z0-9_]*\s*\(/.test(snippet);
        const hasStateSignal = /\b(cache|memory|context|scope|stats|entries|bytes|payload|store|index)\b/i.test(snippet);
        const hasOutputSignal = /\bJSON\.stringify\b|\bconsole\.(?:log|warn|error)\b|^\s*return\b/.test(snippet);
        const hasOptionSignal = /\.option\(/.test(snippet);
        if (!isAction && !isDescription && !hasFocus && !hasFlowCall && !hasStateSignal && !hasOutputSignal && !hasOptionSignal) {
            continue;
        }
        pushLine(i, hasStateSignal ? 'state' : undefined);
    }
    if (!citations.some((citation) => /\.action\(/.test(citation.snippet))) {
        for (let i = anchorIdx; i < endIdx; i++) {
            if (/\.action\(/.test(lines[i] || '')) {
                pushLine(i, 'action');
                break;
            }
        }
    }
    if (citations.length === 0)
        return null;
    return {
        anchorLine: anchorIdx + 1,
        citations: citations.slice(0, maxCitations),
    };
}
function extractCommandOperationNames(citations) {
    const out = [];
    const seen = new Set();
    const ignored = new Set([
        'if', 'for', 'while', 'switch', 'catch', 'return',
        'async', 'argument',
        'console', 'log', 'warn', 'error', 'JSON', 'Promise',
        'Map', 'Set', 'Array', 'Object', 'String', 'Number', 'Date',
        'command', 'description', 'option', 'action',
        'filter', 'map', 'slice', 'sort', 'join', 'push',
    ]);
    for (const citation of citations) {
        for (const match of citation.snippet.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
            const operation = match[1];
            if (!operation || ignored.has(operation))
                continue;
            if (operation.length < 3)
                continue;
            const looksLikeCodeOperation = /[A-Z_]/.test(operation) ||
                /^(get|load|read|list|compute|count|find|search|refresh|record|write|print|format|clear|delete|close|set|diagnose|resolve|build|create|update)/i.test(operation);
            if (!looksLikeCodeOperation)
                continue;
            if (seen.has(operation))
                continue;
            seen.add(operation);
            out.push(operation);
            if (out.length >= 10)
                return out;
        }
    }
    return out;
}
function buildCommandSubcommandFlowDeterministicAnswer(cwd, question, searchTerms, maxCitations) {
    const profile = buildQueryProfile(searchTerms);
    if (!profile.commandFocus || !profile.subcommandFocus)
        return null;
    if (profile.asksRegistration || profile.asksList)
        return null;
    const asksFlowLike = profile.asksHow ||
        /\b(flow|trace|internals?|compute|works?|working|steps?|logic|behavior|behaviour)\b/.test(searchTerms.normalizedQuestion);
    if (!asksFlowLike)
        return null;
    const commandName = profile.commandFocus;
    const subcommand = profile.subcommandFocus;
    const commandPath = `packages/cli/src/commands/${commandName}.ts`;
    const blockEvidence = collectCommandSubcommandBlockEvidence(cwd, commandPath, subcommand, searchTerms, Math.min(Math.max(maxCitations, 8), 16));
    if (!blockEvidence || blockEvidence.citations.length === 0)
        return null;
    const registrationCitations = runRipgrepSearch(cwd, `\\.command\\(['"\`]${escapeRegExp(commandName)}['"\`]\\)`)
        .filter((hit) => normalizeFilePath(hit.path) === 'packages/cli/src/index.ts')
        .slice(0, 1)
        .map((hit) => ({
        path: hit.path,
        line: hit.line,
        term: commandName,
        snippet: hit.snippet,
    }));
    const subcommandDeclRegex = new RegExp(`\\.command\\(['"\`]${escapeRegExp(subcommand)}(?:\\s+\\[[^\\]]+\\])?['"\`]\\)`, 'i');
    const scored = new Map();
    for (const citation of registrationCitations) {
        const key = `${citation.path}:${citation.line}`;
        scored.set(key, {
            ...citation,
            score: 7.2,
            matchedTerms: [commandName],
        });
    }
    for (const citation of blockEvidence.citations) {
        const key = `${citation.path}:${citation.line}`;
        let score = 3.8;
        if (subcommandDeclRegex.test(citation.snippet))
            score += 6.2;
        if (/\.action\(/.test(citation.snippet))
            score += 4.2;
        if (/\.description\(/.test(citation.snippet))
            score += 1.0;
        if (/\b(cache|memory|context|scope|stats|entries|bytes|payload|store|index)\b/i.test(citation.snippet)) {
            score += 2.4;
        }
        if (/\b(?:get|load|read|list|compute|count|find|search|refresh|record|write|print|format|clear|delete|close|set)[A-Za-z0-9_]*\s*\(/.test(citation.snippet)) {
            score += 1.8;
        }
        if (/\bJSON\.stringify\b|\bconsole\.(?:log|warn|error)\b|^\s*return\b/.test(citation.snippet)) {
            score += 0.9;
        }
        scored.set(key, {
            ...citation,
            score,
            matchedTerms: [commandName, subcommand],
        });
    }
    const citations = [...scored.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.min(Math.max(maxCitations, 8), 16))
        .map(({ path, line, snippet, term }) => ({ path, line, snippet, term }));
    if (citations.length === 0)
        return null;
    const hasSubcommandDeclaration = citations.some((citation) => subcommandDeclRegex.test(citation.snippet));
    const hasActionBlock = citations.some((citation) => /\.action\(/.test(citation.snippet));
    if (!hasSubcommandDeclaration)
        return null;
    const sourceFiles = new Set(citations.map((citation) => citation.path)).size;
    const topFiles = [...new Set(citations.map((citation) => citation.path))].slice(0, 5);
    const operations = extractCommandOperationNames(citations.filter((citation) => citation.path === commandPath));
    const answerLines = [
        `Short answer: \`${commandName} ${subcommand}\` is implemented in ${commandPath}:${blockEvidence.anchorLine}.`,
        '',
        'What I verified in code:',
        ...citations.slice(0, 8).map((citation) => `  • ${explainEvidenceCitation(citation)}`),
    ];
    if (operations.length > 0) {
        answerLines.push('');
        answerLines.push('Key operations in this flow:');
        for (const operation of operations.slice(0, 8)) {
            answerLines.push(`  • ${operation}()`);
        }
    }
    answerLines.push('');
    answerLines.push(`If you want, I can trace control flow inside ${commandPath} line-by-line.`);
    const truthScore = Math.min(0.97, 0.73 +
        (hasSubcommandDeclaration ? 0.1 : 0) +
        (hasActionBlock ? 0.08 : 0) +
        Math.min(citations.length * 0.01, 0.06));
    return {
        question,
        questionNormalized: searchTerms.normalizedQuestion,
        mode: 'search',
        answer: answerLines.join('\n'),
        findings: [
            `Command focus: ${commandName}, subcommand focus: ${subcommand}.`,
            `Subcommand block anchor: ${commandPath}:${blockEvidence.anchorLine}.`,
            `Evidence lines: ${citations.length} across ${sourceFiles} file(s).`,
        ],
        confidence: truthScore >= 0.9 ? 'high' : 'medium',
        proof: {
            topFiles,
            evidenceCount: citations.length,
            coverage: {
                sourceCitations: citations.length,
                sourceFiles,
                matchedFiles: sourceFiles,
                matchedLines: citations.length,
            },
        },
        truth: {
            status: hasActionBlock ? 'grounded' : 'insufficient',
            score: Number(truthScore.toFixed(2)),
            reasons: hasActionBlock
                ? ['Command subcommand flow is grounded in direct command action block evidence.']
                : ['Subcommand declaration found but action block evidence is limited.'],
            sourceCitations: citations.length,
            sourceFiles,
            minCitationsRequired: 2,
            minFilesRequired: 1,
        },
        citations,
        generatedAt: new Date().toISOString(),
        stats: {
            scannedFiles: 0,
            matchedFiles: sourceFiles,
            matchedLines: citations.length,
            brainCandidates: 0,
        },
    };
}
function buildAskCacheFlowDeterministicAnswer(cwd, question, searchTerms, maxCitations) {
    const normalized = searchTerms.normalizedQuestion;
    const asksAskCacheFlow = /\bask\b/.test(normalized) &&
        /\bcache\b/.test(normalized) &&
        /\b(how|flow|work|works|working|exact|steps|internals?|mechanism)\b/.test(normalized);
    if (!asksAskCacheFlow)
        return null;
    const probes = [
        { tag: 'hash', pattern: 'computeAskQuestionHash\\(' },
        { tag: 'key', pattern: 'computeAskCacheKey\\(' },
        { tag: 'exact', pattern: 'readCachedAsk\\(' },
        { tag: 'near', pattern: 'findNearCachedAsk\\(' },
        { tag: 'drift', pattern: 'getChangedWorkingTreePaths\\(' },
        { tag: 'write', pattern: 'writeCachedAsk\\(' },
    ];
    const raw = [];
    for (const probe of probes) {
        const hits = runRipgrepSearch(cwd, probe.pattern);
        for (const hit of hits) {
            const normalizedPath = normalizeFilePath(hit.path);
            if (normalizedPath !== 'packages/cli/src/commands/ask.ts' && normalizedPath !== 'packages/cli/src/utils/ask-cache.ts') {
                continue;
            }
            raw.push({ ...hit, tag: probe.tag });
        }
    }
    if (raw.length === 0)
        return null;
    const scoreByTag = {
        hash: 2.3,
        key: 2.0,
        exact: 4.8,
        near: 4.2,
        drift: 2.6,
        write: 4.6,
    };
    const dedup = new Map();
    for (const hit of raw) {
        const key = `${hit.path}:${hit.line}`;
        const score = (scoreByTag[hit.tag] || 0) + (hit.path.endsWith('/commands/ask.ts') ? 1.1 : 0.35);
        const next = {
            path: hit.path,
            line: hit.line,
            snippet: hit.snippet,
            term: hit.tag,
            score,
            matchedTerms: [hit.tag],
        };
        const existing = dedup.get(key);
        if (!existing || existing.score < next.score) {
            dedup.set(key, next);
        }
    }
    const scored = [...dedup.values()].sort((a, b) => b.score - a.score);
    if (scored.length === 0)
        return null;
    const citations = selectTopCitations(scored, Math.min(Math.max(maxCitations, 8), 16), searchTerms);
    if (citations.length === 0)
        return null;
    const hasExact = citations.some((citation) => /readCachedAsk\s*\(/.test(citation.snippet));
    const hasNear = citations.some((citation) => /findNearCachedAsk\s*\(/.test(citation.snippet));
    const hasWrite = citations.some((citation) => /writeCachedAsk\s*\(/.test(citation.snippet));
    const hasHash = citations.some((citation) => /computeAskQuestionHash\s*\(|computeAskCacheKey\s*\(/.test(citation.snippet));
    const hasDrift = citations.some((citation) => /getChangedWorkingTreePaths\s*\(/.test(citation.snippet));
    const verifiedSteps = [];
    if (hasHash)
        verifiedSteps.push('Normalize question + context into deterministic hash and cache key.');
    if (hasExact)
        verifiedSteps.push('Attempt exact cache hit first (`readCachedAsk`).');
    if (hasNear)
        verifiedSteps.push('On exact miss, attempt semantic near-hit reuse (`findNearCachedAsk`).');
    if (hasDrift)
        verifiedSteps.push('Near-hit safety checks include working-tree drift via changed paths.');
    if (hasWrite)
        verifiedSteps.push('On fresh retrieval, write the result back for future asks (`writeCachedAsk`).');
    const sourceFiles = new Set(citations.map((citation) => citation.path)).size;
    const topFiles = [...new Set(citations.map((citation) => citation.path))].slice(0, 5);
    const answerLines = [
        'Short answer: ask cache uses an exact-hit -> near-hit -> fresh-retrieval -> write-back flow.',
        '',
        'Verified implementation steps:',
        ...verifiedSteps.map((step, idx) => `  ${idx + 1}. ${step}`),
        '',
        'Grounding evidence:',
        ...citations.slice(0, 8).map((citation) => `  • ${citation.path}:${citation.line} — ${normalizeSnippet(citation.snippet)}`),
    ];
    const truthScore = (hasExact && hasNear && hasWrite) ? 0.94 : 0.66;
    return {
        question,
        questionNormalized: normalized,
        mode: 'search',
        answer: answerLines.join('\n'),
        findings: [
            `Verified cache-flow steps: ${verifiedSteps.length}.`,
            `Evidence spans ${sourceFiles} file(s).`,
        ],
        confidence: truthScore >= 0.9 ? 'high' : 'medium',
        proof: {
            topFiles,
            evidenceCount: citations.length,
            coverage: {
                sourceCitations: citations.length,
                sourceFiles,
                matchedFiles: sourceFiles,
                matchedLines: citations.length,
            },
        },
        truth: {
            status: 'grounded',
            score: truthScore,
            reasons: ['Ask cache flow is grounded in direct cache function calls in the CLI implementation.'],
            sourceCitations: citations.length,
            sourceFiles,
            minCitationsRequired: 2,
            minFilesRequired: 1,
        },
        citations,
        generatedAt: new Date().toISOString(),
        stats: {
            scannedFiles: 0,
            matchedFiles: sourceFiles,
            matchedLines: citations.length,
            brainCandidates: 0,
        },
    };
}
function buildPatternFromTerms(terms) {
    const parts = terms
        .map((term) => term.trim())
        .filter((term) => term.length >= 2)
        .sort((a, b) => b.length - a.length)
        .slice(0, 16)
        .map((term) => {
        const escaped = escapeRegExp(term);
        if (/^[a-z0-9_]+$/i.test(term)) {
            return `\\b${escaped}\\b`;
        }
        if (term.includes(' ')) {
            return escaped.replace(/\\\s+/g, '\\s+');
        }
        return escaped;
    });
    if (parts.length === 0)
        return '';
    return `(?:${parts.join('|')})`;
}
function parseRgLine(line) {
    const match = line.match(/^(.*?):(\d+):(.*)$/);
    if (!match)
        return null;
    const rawPath = normalizeFilePath(match[1]);
    if (isIgnoredSearchPath(rawPath))
        return null;
    const lineNumber = Number(match[2]);
    if (!rawPath || !Number.isFinite(lineNumber) || lineNumber <= 0)
        return null;
    return {
        path: rawPath,
        line: lineNumber,
        snippet: normalizeSnippet(match[3] || ''),
    };
}
function runRipgrepSearch(cwd, pattern) {
    if (!pattern)
        return [];
    const args = [
        '--line-number',
        '--no-heading',
        '--color', 'never',
        '--max-count', String(RG_MAX_MATCHES),
        '--max-columns', '400',
        '--smart-case',
        '--hidden',
        '--glob', '!**/node_modules/**',
        '--glob', '!**/.git/**',
        '--glob', '!**/dist/**',
        '--glob', '!**/build/**',
        '--glob', '!**/out/**',
        '--glob', '!**/.next/**',
        '--glob', '!**/coverage/**',
        '--glob', '!**/.neurcode/**',
        '--glob', '!**/.pnpm-store/**',
        '--glob', '!*.lock',
        '--glob', '!*.map',
        '--',
        pattern,
        '.',
    ];
    const result = (0, child_process_1.spawnSync)('rg', args, {
        cwd,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 80,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const status = result.status ?? 1;
    if (status !== 0 && status !== 1) {
        return [];
    }
    const stdout = result.stdout || '';
    if (!stdout.trim())
        return [];
    const out = [];
    for (const raw of stdout.split(/\r?\n/)) {
        const parsed = parseRgLine(raw.trim());
        if (!parsed)
            continue;
        out.push(parsed);
        if (out.length >= RG_MAX_MATCHES)
            break;
    }
    return out;
}
function fallbackScanMatches(cwd, fileTree, pattern, maxMatches = 1200) {
    const out = [];
    if (!pattern)
        return out;
    let regex;
    try {
        regex = new RegExp(pattern, 'i');
    }
    catch {
        return out;
    }
    for (const filePath of fileTree) {
        if (out.length >= maxMatches)
            break;
        if (isIgnoredSearchPath(filePath))
            continue;
        const fullPath = (0, path_1.join)(cwd, filePath);
        let content = '';
        try {
            const st = (0, fs_1.statSync)(fullPath);
            if (st.size > MAX_FILE_BYTES)
                continue;
            content = (0, fs_1.readFileSync)(fullPath, 'utf-8');
        }
        catch {
            continue;
        }
        const lines = content.split(/\r?\n/);
        for (let idx = 0; idx < lines.length; idx++) {
            const line = lines[idx];
            if (!line)
                continue;
            if (!regex.test(line))
                continue;
            out.push({
                path: filePath,
                line: idx + 1,
                snippet: normalizeSnippet(line),
            });
            if (out.length >= maxMatches)
                break;
        }
    }
    return out;
}
function collectRepoEvidence(cwd, fileTree, searchTerms, pathBoostScores) {
    const pattern = buildPatternFromTerms(searchTerms.rgTerms);
    const fromRg = runRipgrepSearch(cwd, pattern);
    const rawMatches = fromRg.length > 0 ? fromRg : fallbackScanMatches(cwd, fileTree, pattern);
    const profile = buildQueryProfile(searchTerms);
    const asksLocation = profile.asksLocation;
    const asksHow = profile.asksHow;
    const asksList = profile.asksList;
    const asksRegistration = profile.asksRegistration;
    const commandFocus = profile.commandFocus;
    const subcommandFocus = profile.subcommandFocus;
    const subcommandDeclRegex = subcommandFocus
        ? new RegExp(`\\.command\\(['"\`]${escapeRegExp(subcommandFocus)}(?:\\s+\\[[^\\]]+\\])?['"\`]\\)`, 'i')
        : null;
    const codeFocused = profile.codeFocused;
    const matchedTerms = new Set();
    const dedup = new Map();
    for (const match of rawMatches) {
        if (isIgnoredSearchPath(match.path))
            continue;
        const pathLower = match.path.toLowerCase();
        const snippetLower = (match.snippet || '').toLowerCase();
        const isDocPath = isLikelyDocumentationPath(match.path);
        const docSnippet = isLikelyDocSnippet(match.snippet);
        const codeSnippet = isLikelyCodeSnippet(match.snippet);
        const promptExample = isPromptExampleSnippet(match.snippet, searchTerms.normalizedQuestion, searchTerms.highSignalTerms);
        if (asksLocation && codeFocused && (pathLower.endsWith('.md') || pathLower.endsWith('.txt'))) {
            continue;
        }
        const termHits = searchTerms.rgTerms.filter((term) => {
            const normalized = term.toLowerCase();
            if (normalized.includes(' '))
                return snippetLower.includes(normalized);
            const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(normalized)}(?:$|[^a-z0-9])`, 'i');
            return pattern.test(snippetLower);
        });
        const highSignalHits = searchTerms.highSignalTerms.filter((term) => {
            const normalized = term.toLowerCase();
            if (normalized.includes(' '))
                return snippetLower.includes(normalized);
            const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(normalized)}(?:$|[^a-z0-9])`, 'i');
            return pattern.test(snippetLower);
        });
        const identifierHits = searchTerms.identifiers.filter((identifier) => new RegExp(`\\b${escapeRegExp(identifier)}\\b`, 'i').test(match.snippet));
        const pathHits = searchTerms.highSignalTerms.filter((term) => pathLower.includes(term)).length;
        const quotedHits = searchTerms.quotedPhrases.filter((phrase) => snippetLower.includes(phrase.toLowerCase())).length;
        let score = 0;
        score += termHits.length * 1.15;
        score += highSignalHits.length * 1.65;
        score += identifierHits.length * 2.05;
        score += pathHits * (asksLocation ? 1.95 : 1.1);
        score += quotedHits * 2.1;
        if (codeFocused && codeSnippet) {
            score += 0.95;
        }
        if (codeFocused && !codeSnippet) {
            score -= 1.35;
        }
        if (docSnippet) {
            score -= codeFocused ? 1.9 : 0.6;
        }
        if (isDocPath && codeFocused) {
            score -= asksLocation ? 3.7 : 2.2;
        }
        if (promptExample) {
            score -= codeFocused ? 4.4 : 2.2;
        }
        if (/\b(?:export\s+)?(?:function|class|const|interface|type|enum)\b/.test(match.snippet)) {
            score += 0.85;
        }
        if (asksLocation && /\b(?:function|class|interface|type)\b/.test(match.snippet)) {
            score += 0.75;
        }
        if (asksHow && /\b(if|else|return|await|for|while|switch|try|catch)\b/.test(match.snippet)) {
            score += 0.55;
        }
        if (asksList && /\.command\(|\.option\(|\bneurcode\s+[a-z]/i.test(match.snippet)) {
            score += 0.7;
        }
        if (asksRegistration && /(?:^|[^a-z])(?:register|registered|registration)(?:$|[^a-z])/i.test(match.snippet)) {
            score += 0.8;
        }
        if (asksRegistration && /\.command\(|program\.command\(/i.test(match.snippet)) {
            score += 2.3;
        }
        if (asksLocation && profile.highSignalSet.has('middleware') && pathLower.includes('/middleware/')) {
            score += 1.9;
        }
        if (asksLocation && profile.highSignalSet.has('middleware') && !pathLower.includes('middleware')) {
            score -= 1.7;
        }
        if (asksLocation && profile.highSignalSet.has('auth') && /(?:^|\/)auth(?:[-_.]|\/|\.|$)/.test(pathLower)) {
            score += 1.25;
        }
        if (asksLocation && profile.highSignalSet.has('orgid') && /\borgid\b|organizationid/i.test(match.snippet)) {
            score += 1.45;
        }
        if (commandFocus) {
            if (new RegExp(`\\.command\\(['"\`]${escapeRegExp(commandFocus)}['"\`]\\)`, 'i').test(match.snippet)) {
                score += 6.2;
            }
            if (asksRegistration && pathLower === 'packages/cli/src/index.ts') {
                score += 2.8;
            }
            if (pathLower.includes(`/commands/${commandFocus}.`)) {
                score += asksHow ? 3.2 : 1.8;
                if (subcommandDeclRegex && subcommandDeclRegex.test(match.snippet)) {
                    score += 4.1;
                }
            }
            else if (pathLower.includes('/commands/')) {
                score -= asksHow ? 1.85 : 0.45;
            }
            if (asksHow && pathLower.includes('/commands/') && !pathLower.includes(`/commands/${commandFocus}.`) && pathLower !== 'packages/cli/src/index.ts') {
                score -= 1.05;
            }
            if (commandFocus !== 'ask' && pathLower.endsWith('/commands/ask.ts')) {
                score -= 3.2;
            }
        }
        if (codeFocused && (pathLower.endsWith('.md') || pathLower.startsWith('docs/'))) {
            score -= 1.35;
        }
        if (codeFocused && (pathLower.endsWith('.txt') || pathLower.includes('audit'))) {
            score -= 1.8;
        }
        if (codeFocused && /(?:^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/i.test(pathLower)) {
            score -= 4.5;
        }
        if (codeFocused && /\bneurcode\s+(ask|plan|verify|ship)\s+["`]/i.test(match.snippet)) {
            score -= 2.4;
        }
        if (codeFocused && /\?/.test(match.snippet) && /\b(neurcode|ask|plan)\b/i.test(match.snippet)) {
            score -= 1.1;
        }
        if (codeFocused && /\bnew Set\(\[/.test(match.snippet)) {
            score -= 1.1;
        }
        if (codeFocused && /\\b\([^)]*\|[^)]*\)/.test(match.snippet) && /\.test\(/.test(match.snippet)) {
            score -= 1.45;
        }
        if (pathLower.includes('/commands/')) {
            score += 0.15;
        }
        if (asksRegistration && pathLower.endsWith('/commands/ask.ts')) {
            score -= 2.4;
        }
        if (asksLocation && codeFocused && pathLower.endsWith('/commands/ask.ts')) {
            score -= 2.9;
        }
        const boost = pathBoostScores.get(match.path) || 0;
        if (boost > 0) {
            const cappedBoost = codeFocused && isDocPath
                ? Math.min(boost, 0.06)
                : Math.min(boost, 0.45);
            score += cappedBoost;
        }
        if (score <= 0)
            continue;
        for (const term of highSignalHits) {
            matchedTerms.add(term);
        }
        const dominantTerm = highSignalHits[0] ||
            identifierHits[0] ||
            termHits[0] ||
            '';
        const key = `${match.path}:${match.line}`;
        const next = {
            path: match.path,
            line: match.line,
            snippet: match.snippet,
            term: dominantTerm || undefined,
            score,
            matchedTerms: [...new Set([...highSignalHits, ...identifierHits, ...termHits])],
        };
        const existing = dedup.get(key);
        if (!existing || existing.score < next.score) {
            dedup.set(key, next);
        }
    }
    const scoredCitations = [...dedup.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RAW_CITATIONS);
    return {
        scoredCitations,
        matchedTerms,
        scannedFiles: fileTree.length,
    };
}
function selectTopCitations(scored, maxCitations, searchTerms) {
    if (scored.length === 0)
        return [];
    const profile = buildQueryProfile(searchTerms);
    const asksLocationCode = profile.asksLocation && profile.codeFocused;
    const structuralTerms = new Set([
        'middleware', 'route', 'routes', 'service', 'services', 'controller', 'controllers',
        'command', 'commands', 'schema', 'model', 'models', 'db', 'database', 'api', 'auth',
        'cache', 'plan', 'verify', 'ship', 'apply', 'watch',
    ]);
    const sorted = [...scored].sort((a, b) => b.score - a.score);
    const topScore = sorted[0]?.score || 0;
    const scoreFloor = asksLocationCode ? topScore * 0.45 : topScore * 0.18;
    let candidates = sorted.filter((citation) => citation.score >= scoreFloor);
    if (candidates.length === 0) {
        candidates = sorted.slice(0, maxCitations * 3);
    }
    if (asksLocationCode) {
        const anchorTerms = searchTerms.highSignalTerms.filter((term) => structuralTerms.has(term.toLowerCase()));
        if (anchorTerms.length > 0) {
            const anchored = candidates.filter((citation) => {
                const pathLower = citation.path.toLowerCase();
                return anchorTerms.some((term) => pathLower.includes(term.toLowerCase()));
            });
            if (anchored.length >= Math.min(2, maxCitations)) {
                candidates = anchored;
            }
        }
        const strict = candidates.filter((citation) => !isLikelyDocumentationPath(citation.path) &&
            !isLikelyDocSnippet(citation.snippet) &&
            !isPromptExampleSnippet(citation.snippet, searchTerms.normalizedQuestion, searchTerms.highSignalTerms) &&
            isLikelyCodeSnippet(citation.snippet));
        if (strict.length >= Math.min(maxCitations, 3)) {
            candidates = strict;
        }
        else {
            const merged = [];
            const seen = new Set();
            for (const citation of [...strict, ...candidates]) {
                const key = `${citation.path}:${citation.line}`;
                if (seen.has(key))
                    continue;
                seen.add(key);
                merged.push(citation);
            }
            candidates = merged;
        }
    }
    if (profile.codeFocused && !asksLocationCode) {
        const identifierAnchors = searchTerms.identifiers
            .map((term) => (0, plan_cache_1.normalizeIntent)(term))
            .filter((term) => term.length >= 3);
        const termAnchors = searchTerms.highSignalTerms
            .map((term) => term.toLowerCase().trim())
            .filter((term) => term.length >= 3 && !LOW_SIGNAL_TERMS.has(term));
        const anchors = [...new Set([...identifierAnchors, ...termAnchors])].slice(0, 8);
        if (anchors.length > 0) {
            const anchored = candidates.filter((citation) => {
                const pathLower = citation.path.toLowerCase();
                const snippetLower = citation.snippet.toLowerCase();
                return anchors.some((term) => {
                    if (pathLower.includes(term))
                        return true;
                    const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(term)}(?:$|[^a-z0-9])`, 'i');
                    return pattern.test(snippetLower);
                });
            });
            if (anchored.length >= Math.min(maxCitations, 4)) {
                candidates = anchored;
            }
        }
    }
    if (profile.commandFocus) {
        const commandNeedle = `/commands/${profile.commandFocus}.`;
        const commandAnchored = candidates.filter((citation) => {
            const pathLower = citation.path.toLowerCase();
            return pathLower.includes(commandNeedle) || pathLower === 'packages/cli/src/index.ts';
        });
        if (commandAnchored.length >= Math.min(maxCitations, 3)) {
            candidates = commandAnchored;
        }
    }
    const byFile = new Map();
    for (const citation of candidates) {
        const bucket = byFile.get(citation.path) || [];
        bucket.push(citation);
        byFile.set(citation.path, bucket);
    }
    for (const list of byFile.values()) {
        list.sort((a, b) => b.score - a.score);
    }
    const selected = [];
    // Pass 1: strongest line per file.
    for (const [_, list] of [...byFile.entries()].sort((a, b) => b[1][0].score - a[1][0].score)) {
        if (selected.length >= maxCitations)
            break;
        selected.push(list.shift());
    }
    // Pass 2: fill remaining by global score.
    const remainder = [...byFile.values()].flat().sort((a, b) => b.score - a.score);
    for (const citation of remainder) {
        if (selected.length >= maxCitations)
            break;
        selected.push(citation);
    }
    return selected.map(({ path, line, snippet, term }) => ({ path, line, snippet, term }));
}
function evaluateTruth(normalizedQuestion, highSignalTerms, citations) {
    const sourceCitations = citations.length;
    const sourceFiles = new Set(citations.map((c) => c.path)).size;
    const asksLocation = /\b(where|which file|location|defined|implemented|called|computed|resolved)\b/.test(normalizedQuestion);
    const asksList = /\b(list|all|available|commands|files|features)\b/.test(normalizedQuestion);
    const commandFocus = detectCommandFocus(normalizedQuestion);
    const subcommandFocus = detectSubcommandFocus(normalizedQuestion, commandFocus);
    const minCitationsRequired = asksLocation ? 1 : asksList ? 3 : 2;
    const minFilesRequired = asksLocation ? 1 : 2;
    const matchedHighSignalTerms = highSignalTerms.filter((term) => {
        const normalized = term.toLowerCase();
        return citations.some((citation) => {
            const haystack = `${citation.path} ${citation.snippet}`.toLowerCase();
            if (normalized.includes(' '))
                return haystack.includes(normalized);
            const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(normalized)}(?:$|[^a-z0-9])`, 'i');
            return pattern.test(haystack);
        });
    });
    const coverage = highSignalTerms.length === 0
        ? (sourceCitations > 0 ? 1 : 0)
        : matchedHighSignalTerms.length / highSignalTerms.length;
    const citationScore = Math.min(1, sourceCitations / Math.max(minCitationsRequired, 3));
    const fileScore = Math.min(1, sourceFiles / Math.max(minFilesRequired, 2));
    let score = Math.max(0, Math.min(1, citationScore * 0.45 + fileScore * 0.35 + coverage * 0.2));
    const reasons = [];
    if (sourceCitations < minCitationsRequired) {
        reasons.push(`Only ${sourceCitations} citation(s) found (minimum ${minCitationsRequired} expected).`);
    }
    if (sourceFiles < minFilesRequired) {
        reasons.push(`Evidence spans ${sourceFiles} file(s) (minimum ${minFilesRequired} expected).`);
    }
    if (highSignalTerms.length > 0 && coverage < 0.4) {
        reasons.push('Important query terms were not well represented in matched evidence.');
    }
    if (commandFocus) {
        const commandNeedle = `/commands/${commandFocus}.`;
        const commandFileCitations = citations.filter((citation) => citation.path.toLowerCase().includes(commandNeedle));
        const registrationHits = citations.filter((citation) => citation.path.toLowerCase() === 'packages/cli/src/index.ts' &&
            new RegExp(`\\.command\\(['"\`]${escapeRegExp(commandFocus)}['"\`]\\)`, 'i').test(citation.snippet));
        const anchoredCount = commandFileCitations.length + registrationHits.length;
        const anchoredRatio = sourceCitations > 0 ? anchoredCount / sourceCitations : 0;
        if (anchoredCount === 0) {
            reasons.push(`No direct evidence found in ${commandNeedle} or command registration wiring.`);
        }
        else if (sourceCitations >= 2 && anchoredRatio < 0.35) {
            reasons.push('Top evidence is weakly anchored to the referenced command implementation.');
        }
        if (subcommandFocus) {
            const subcommandDeclRegex = new RegExp(`\\.command\\(['"\`]${escapeRegExp(subcommandFocus)}(?:\\s+\\[[^\\]]+\\])?['"\`]\\)`, 'i');
            const hasSubcommandDeclaration = citations.some((citation) => citation.path.toLowerCase().includes(commandNeedle) &&
                subcommandDeclRegex.test(citation.snippet));
            if (!hasSubcommandDeclaration) {
                reasons.push(`No direct \`${subcommandFocus}\` subcommand declaration found in ${commandNeedle}.`);
            }
        }
        if (anchoredRatio < 0.35) {
            score *= 0.68;
        }
        else if (anchoredRatio < 0.55) {
            score *= 0.86;
        }
    }
    if (score < 0.4 && reasons.length === 0) {
        reasons.push('Evidence quality is below the confidence threshold.');
    }
    return {
        status: reasons.length === 0 ? 'grounded' : 'insufficient',
        score,
        reasons,
        sourceCitations,
        sourceFiles,
        minCitationsRequired,
        minFilesRequired,
    };
}
function calibrateConfidence(truth) {
    if (truth.status === 'insufficient')
        return 'low';
    if (truth.score >= 0.78)
        return 'high';
    if (truth.score >= 0.55)
        return 'medium';
    return 'low';
}
function isPrimarySourcePath(path) {
    const normalized = path.toLowerCase();
    if (isIgnoredSearchPath(normalized))
        return false;
    if (isLikelyDocumentationPath(normalized))
        return false;
    if (normalized === 'license' || normalized.startsWith('license.'))
        return false;
    if (normalized.endsWith('/license') || normalized.includes('/license.'))
        return false;
    if (normalized.startsWith('changelog') || normalized.includes('/changelog'))
        return false;
    if (normalized.endsWith('pnpm-lock.yaml'))
        return false;
    if (normalized.endsWith('package-lock.json'))
        return false;
    if (normalized.endsWith('yarn.lock'))
        return false;
    if (normalized.endsWith('.md'))
        return false;
    if (normalized.endsWith('.txt'))
        return false;
    if (normalized === 'readme.md')
        return false;
    if (normalized.startsWith('docs/'))
        return false;
    if (normalized.includes('/__tests__/'))
        return false;
    if (normalized.includes('.test.') || normalized.includes('.spec.'))
        return false;
    return true;
}
function formatCitationLocation(citation) {
    return `${citation.path}:${citation.line}`;
}
function explainEvidenceCitation(citation) {
    const location = formatCitationLocation(citation);
    const snippet = normalizeSnippet(citation.snippet);
    if (!snippet)
        return `${location}`;
    if (/\.command\(/.test(snippet)) {
        return `${location} registers CLI wiring: ${snippet}`;
    }
    if (/^\s*import\b/.test(snippet)) {
        return `${location} connects module dependency: ${snippet}`;
    }
    if (/\b(orgid|organizationid|userid|token|auth)\b/i.test(snippet) && /=/.test(snippet)) {
        return `${location} sets auth/org context: ${snippet}`;
    }
    if (/\breturn\b/.test(snippet)) {
        return `${location} returns runtime behavior: ${snippet}`;
    }
    if (/\bawait\b/.test(snippet)) {
        return `${location} performs async flow step: ${snippet}`;
    }
    return `${location} — ${snippet}`;
}
function collectUniquePaths(citations, limit, skipFirst) {
    const out = [];
    const seen = new Set();
    const start = skipFirst ? 1 : 0;
    for (let i = start; i < citations.length; i++) {
        const path = citations[i]?.path;
        if (!path || seen.has(path))
            continue;
        seen.add(path);
        out.push(path);
        if (out.length >= limit)
            break;
    }
    return out;
}
function buildRepoAnswerPayload(question, searchTerms, citations, stats, truth) {
    const profile = buildQueryProfile(searchTerms);
    const asksLocation = profile.asksLocation;
    const asksHow = profile.asksHow;
    const asksList = profile.asksList;
    const primary = citations[0];
    const primaryLocation = primary ? formatCitationLocation(primary) : null;
    const flowPaths = collectUniquePaths(citations, 4, false);
    const relatedPaths = collectUniquePaths(citations, 4, true);
    const evidenceLines = citations
        .slice(0, 6)
        .map((citation) => `  • ${explainEvidenceCitation(citation)}`);
    let answer = '';
    if (citations.length === 0) {
        answer = [
            'Short answer: I do not have enough direct repository evidence for this yet.',
            '',
            'What will improve accuracy:',
            '  • Add a folder/file hint (for example: `in packages/cli/src/commands`).',
            '  • Mention exact identifiers (function/class/flag names) if you have them.',
        ].join('\n');
    }
    else if (asksLocation) {
        const relatedContext = relatedPaths.length > 0
            ? ['', 'Related context worth checking:', ...relatedPaths.map((path) => `  • ${path}`)]
            : [];
        answer = [
            `Short answer: ${primaryLocation} is the strongest direct location match.`,
            '',
            'What I verified in code:',
            ...evidenceLines,
            ...relatedContext,
            '',
            `If you want, I can trace upstream callers and downstream usage from ${primaryLocation}.`,
        ].join('\n');
    }
    else if (asksHow) {
        const flowSummary = flowPaths.length > 1
            ? flowPaths.join(' -> ')
            : flowPaths[0] || (primaryLocation || 'the top match');
        const relatedContext = relatedPaths.length > 0
            ? ['', 'Related context:', ...relatedPaths.map((path) => `  • ${path}`)]
            : [];
        answer = [
            `Short answer: the implementation flow is centered around ${flowSummary}.`,
            '',
            'Evidence-backed breakdown:',
            ...evidenceLines,
            ...relatedContext,
        ].join('\n');
    }
    else if (asksList) {
        answer = [
            `Short answer: I verified ${truth.sourceCitations} evidence line(s) across ${truth.sourceFiles} file(s).`,
            '',
            'Most relevant items:',
            ...evidenceLines,
            '',
            'If you want, I can rank these by execution order next.',
        ].join('\n');
    }
    else {
        const corroborating = relatedPaths.slice(0, 2);
        const corroboratingText = corroborating.length > 0 ? corroborating.join(', ') : 'nearby modules';
        answer = [
            `Short answer: ${primaryLocation} is the strongest anchor, corroborated by ${corroboratingText}.`,
            '',
            'What I can confirm directly from the codebase:',
            ...evidenceLines,
        ].join('\n');
    }
    const findings = [
        `Matched ${stats.matchedLines} evidence line(s) across ${stats.matchedFiles} primary source file(s).`,
    ];
    if (primaryLocation) {
        findings.push(`Primary evidence anchor: ${primaryLocation}`);
    }
    if (flowPaths.length > 1) {
        findings.push(`Inferred file flow: ${flowPaths.join(' -> ')}`);
    }
    if (searchTerms.highSignalTerms.length > 0) {
        findings.push(`High-signal terms used: ${searchTerms.highSignalTerms.slice(0, 8).join(', ')}`);
    }
    if (truth.status === 'insufficient') {
        findings.push(...truth.reasons);
        findings.push('Add a tighter module/file hint to improve grounding precision.');
    }
    const topFiles = [...citations.reduce((acc, citation) => {
            acc.set(citation.path, (acc.get(citation.path) || 0) + 1);
            return acc;
        }, new Map())]
        .sort((a, b) => b[1] - a[1])
        .map(([path]) => path)
        .slice(0, 5);
    return {
        question,
        questionNormalized: searchTerms.normalizedQuestion,
        mode: 'search',
        answer,
        findings,
        confidence: calibrateConfidence(truth),
        proof: {
            topFiles,
            evidenceCount: citations.length,
            coverage: {
                sourceCitations: truth.sourceCitations,
                sourceFiles: truth.sourceFiles,
                matchedFiles: stats.matchedFiles,
                matchedLines: stats.matchedLines,
            },
        },
        truth: {
            status: truth.status,
            score: Number(truth.score.toFixed(2)),
            reasons: truth.reasons,
            sourceCitations: truth.sourceCitations,
            sourceFiles: truth.sourceFiles,
            minCitationsRequired: truth.minCitationsRequired,
            minFilesRequired: truth.minFilesRequired,
        },
        citations,
        generatedAt: new Date().toISOString(),
        stats,
    };
}
function stripHtml(value) {
    return value
        .replace(/<[^>]*>/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
}
const EXTERNAL_LLM_BASE_URL = (process.env.NEURCODE_ASK_EXTERNAL_BASE_URL || 'https://api.deepinfra.com/v1/openai').replace(/\/+$/, '');
const EXTERNAL_LLM_MODEL = process.env.NEURCODE_ASK_EXTERNAL_MODEL || 'deepseek-ai/DeepSeek-V3.2';
const EXTERNAL_LLM_KEY_ENV_NAMES = [
    'DEEPINFRA_API_KEY',
    'NEURCODE_DEEPINFRA_API_KEY',
    'DEEPSEEK_API_KEY',
    'NEURCODE_DEEPSEEK_API_KEY',
];
function resolveExternalLlmApiKey() {
    for (const envName of EXTERNAL_LLM_KEY_ENV_NAMES) {
        const value = process.env[envName];
        if (value && value.trim())
            return value.trim();
    }
    return null;
}
function inferExternalAnswerConfidence(text) {
    const normalized = (0, plan_cache_1.normalizeIntent)(text);
    if (!normalized)
        return 'low';
    if (/\b(i am not sure|i'm not sure|unsure|unknown|cannot verify|can't verify|not certain|might|may|possibly|likely|probably)\b/.test(normalized)) {
        return 'low';
    }
    if (text.split(/\s+/).length <= 28)
        return 'high';
    return 'medium';
}
async function fetchExternalLlmAnswer(question) {
    if (process.env.NEURCODE_ASK_DISABLE_EXTERNAL_WEB === '1') {
        return null;
    }
    const apiKey = resolveExternalLlmApiKey();
    if (!apiKey)
        return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(`${EXTERNAL_LLM_BASE_URL}/chat/completions`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: EXTERNAL_LLM_MODEL,
                messages: [
                    {
                        role: 'system',
                        content: [
                            'You answer non-codebase factual questions for a CLI assistant.',
                            'Return a direct factual answer in at most 2 short sentences.',
                            'If uncertain, explicitly say you are not sure instead of guessing.',
                            'Do not include markdown or code fences.',
                        ].join(' '),
                    },
                    {
                        role: 'user',
                        content: question,
                    },
                ],
                temperature: 0.1,
                max_tokens: 220,
            }),
        });
        if (!response.ok)
            return null;
        const payload = await response.json();
        const content = payload.choices?.[0]?.message?.content;
        if (typeof content !== 'string')
            return null;
        const text = stripHtml(content).replace(/^short answer:\s*/i, '').trim();
        if (!text)
            return null;
        return {
            text,
            source: `${EXTERNAL_LLM_MODEL} via DeepInfra`,
            confidence: inferExternalAnswerConfidence(text),
        };
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
async function buildExternalAnswerPayload(question, normalizedQuestion, reasons) {
    const external = await fetchExternalLlmAnswer(question);
    const hasExternalLlmKey = Boolean(resolveExternalLlmApiKey());
    const shortAnswer = external?.text
        ? `Short answer: ${external.text}`
        : hasExternalLlmKey
            ? 'Short answer: I could not get a reliable external response right now.'
            : 'Short answer: I could not answer this external question because DeepSeek is not configured (set DEEPINFRA_API_KEY).';
    const sourceNote = external?.source
        ? `Source used: ${external.source}`
        : hasExternalLlmKey
            ? 'DeepSeek request failed or returned no answer.'
            : 'DeepSeek not configured. Set DEEPINFRA_API_KEY to enable external free-flow answers.';
    const truthScore = external
        ? external.confidence === 'high'
            ? 0.42
            : external.confidence === 'medium'
                ? 0.34
                : 0.24
        : 0.08;
    return {
        question,
        questionNormalized: normalizedQuestion,
        mode: 'search',
        answer: [
            shortAnswer,
            '',
            'I am strongest on repository questions. Come back with a codebase question and I will answer with file/line citations.',
        ].join('\n'),
        findings: [
            'Question appears to be outside repository scope.',
            sourceNote,
        ],
        confidence: external ? (external.confidence === 'high' ? 'medium' : 'low') : 'low',
        proof: {
            topFiles: [],
            evidenceCount: 0,
            coverage: {
                sourceCitations: 0,
                sourceFiles: 0,
                matchedFiles: 0,
                matchedLines: 0,
            },
        },
        truth: {
            status: 'insufficient',
            score: Number(truthScore.toFixed(2)),
            reasons: [
                'Answer is not grounded in repository files.',
                ...reasons,
            ],
            sourceCitations: 0,
            sourceFiles: 0,
            minCitationsRequired: 2,
            minFilesRequired: 1,
        },
        citations: [],
        generatedAt: new Date().toISOString(),
        stats: {
            scannedFiles: 0,
            matchedFiles: 0,
            matchedLines: 0,
            brainCandidates: 0,
        },
    };
}
function emitAskResult(result, options) {
    if (options.json) {
        const payload = {
            ...result,
            citations: result.citations.slice(0, options.maxCitations),
            cache: options.cacheLabel || 'miss',
            ...(activeAskScopeTelemetry ? { scope: activeAskScopeTelemetry } : {}),
        };
        console.log(JSON.stringify({
            ...payload,
        }, null, 2));
        return;
    }
    if (options.cacheLabel) {
        console.log(chalk.dim(`⚡ ${options.cacheLabel}\n`));
    }
    if (!options.fromPlan) {
        console.log(chalk.bold.cyan('🧠 Neurcode Ask\n'));
    }
    console.log(chalk.bold.white('Question:'));
    console.log(chalk.dim(result.question));
    console.log('');
    console.log(chalk.bold.white('Answer:'));
    if (result.truth.status === 'grounded') {
        console.log(chalk.green(result.answer));
    }
    else {
        console.log(chalk.yellow(result.answer));
    }
    const showProof = options.proof === true;
    const showVerbose = options.verbose === true;
    if (!showProof && !showVerbose) {
        console.log(chalk.dim(`\nConfidence: ${result.confidence.toUpperCase()}`));
        if (result.truth.status === 'insufficient' && result.truth.reasons.length > 0) {
            console.log(chalk.yellow('\nWhy confidence is limited:'));
            for (const reason of result.truth.reasons.slice(0, 2)) {
                console.log(chalk.yellow(`  • ${reason}`));
            }
            console.log(chalk.dim('\nTip: add `--proof` for concise evidence or `--verbose` for full evidence output.'));
        }
        return;
    }
    if (showProof) {
        if (result.proof) {
            console.log(chalk.bold.white('\nProof:'));
            if (result.proof.topFiles.length > 0) {
                console.log(chalk.cyan(`  • Top files: ${result.proof.topFiles.slice(0, 5).join(', ')}`));
            }
            console.log(chalk.cyan(`  • Coverage: citations=${result.proof.coverage.sourceCitations}, files=${result.proof.coverage.sourceFiles}, matched_lines=${result.proof.coverage.matchedLines}`));
        }
        const proofCitations = result.citations.slice(0, Math.min(options.maxCitations, 6));
        if (proofCitations.length > 0) {
            console.log(chalk.bold.white('\nKey Evidence:'));
            proofCitations.forEach((citation, idx) => {
                console.log(chalk.dim(`  ${idx + 1}. ${citation.path}:${citation.line} ${citation.snippet}`));
            });
        }
    }
    if (showVerbose) {
        if (result.findings.length > 0) {
            console.log(chalk.bold.white('\nFindings:'));
            for (const finding of result.findings) {
                console.log(chalk.cyan(`  • ${finding}`));
            }
        }
        const verboseCitations = result.citations.slice(0, options.maxCitations);
        if (verboseCitations.length > 0) {
            console.log(chalk.bold.white('\nEvidence:'));
            verboseCitations.forEach((citation, idx) => {
                const prefix = citation.term ? `${citation.term} ` : '';
                console.log(chalk.dim(`  ${idx + 1}. ${citation.path}:${citation.line} ${prefix}${citation.snippet}`));
            });
        }
    }
    const truthLabel = result.truth.status === 'grounded' ? chalk.green('GROUNDED') : chalk.yellow('INSUFFICIENT');
    console.log(chalk.dim(`\nTruth Mode: ${truthLabel} (score=${result.truth.score.toFixed(2)}, source_citations=${result.truth.sourceCitations}, source_files=${result.truth.sourceFiles})`));
    console.log(chalk.dim(`Confidence: ${result.confidence.toUpperCase()} | scanned=${result.stats.scannedFiles} matched=${result.stats.matchedFiles}`));
}
let activeAskScopeTelemetry = null;
async function askCommand(question, options = {}) {
    try {
        if (!question || !question.trim()) {
            console.error(chalk.red('❌ Error: Question cannot be empty.'));
            console.log(chalk.dim('Usage: neurcode ask "<question>"'));
            process.exit(1);
        }
        const rootResolution = (0, project_root_1.resolveNeurcodeProjectRootWithTrace)(process.cwd());
        const cwd = rootResolution.projectRoot;
        activeAskScopeTelemetry = (0, scope_telemetry_1.buildScopeTelemetryPayload)(rootResolution);
        if (!options.json) {
            (0, scope_telemetry_1.printScopeTelemetry)(chalk, activeAskScopeTelemetry, {
                includeBlockedWarning: true,
            });
        }
        const config = (0, config_1.loadConfig)();
        const orgId = (0, state_1.getOrgId)();
        const stateProjectId = (0, state_1.getProjectId)();
        const projectId = options.projectId || stateProjectId || config.projectId || null;
        const scope = { orgId: orgId || null, projectId: projectId || null };
        const maxCitations = Math.max(3, Math.min(options.maxCitations || 12, 30));
        const shouldUseCache = options.cache !== false && process.env.NEURCODE_ASK_NO_CACHE !== '1';
        const searchTerms = buildSearchTerms(question);
        const ownershipAnswer = buildOwnershipDeterministicAnswer(cwd, question, searchTerms.normalizedQuestion);
        if (ownershipAnswer) {
            emitAskResult(ownershipAnswer, {
                json: options.json,
                maxCitations,
                fromPlan: options.fromPlan,
                verbose: options.verbose,
                proof: options.proof,
            });
            if (orgId && projectId) {
                (0, brain_context_1.recordBrainProgressEvent)(cwd, scope, {
                    type: 'ask',
                    note: `mode=deterministic;reason=ownership_git_history;truth=${ownershipAnswer.truth.status};score=${ownershipAnswer.truth.score.toFixed(2)}`,
                });
            }
            return;
        }
        const scopeAssessment = classifyQuestionScope(question, searchTerms);
        if (scopeAssessment.kind === 'external') {
            const externalPayload = await buildExternalAnswerPayload(question, searchTerms.normalizedQuestion, scopeAssessment.reasons);
            emitAskResult(externalPayload, {
                json: options.json,
                maxCitations,
                fromPlan: options.fromPlan,
                verbose: options.verbose,
                proof: options.proof,
            });
            if (orgId && projectId) {
                (0, brain_context_1.recordBrainProgressEvent)(cwd, scope, {
                    type: 'ask',
                    note: `mode=external;truth=${externalPayload.truth.status};score=${externalPayload.truth.score.toFixed(2)}`,
                });
            }
            return;
        }
        const registrationAnswer = buildCommandRegistrationDeterministicAnswer(cwd, question, searchTerms, maxCitations);
        if (registrationAnswer) {
            emitAskResult(registrationAnswer, {
                json: options.json,
                maxCitations,
                fromPlan: options.fromPlan,
                verbose: options.verbose,
                proof: options.proof,
            });
            if (orgId && projectId) {
                (0, brain_context_1.recordBrainProgressEvent)(cwd, scope, {
                    type: 'ask',
                    note: `mode=deterministic;reason=command_registration;truth=${registrationAnswer.truth.status};score=${registrationAnswer.truth.score.toFixed(2)}`,
                });
            }
            return;
        }
        const commandInventoryAnswer = buildCommandInventoryDeterministicAnswer(cwd, question, searchTerms, maxCitations);
        if (commandInventoryAnswer) {
            emitAskResult(commandInventoryAnswer, {
                json: options.json,
                maxCitations,
                fromPlan: options.fromPlan,
                verbose: options.verbose,
                proof: options.proof,
            });
            if (orgId && projectId) {
                (0, brain_context_1.recordBrainProgressEvent)(cwd, scope, {
                    type: 'ask',
                    note: `mode=deterministic;reason=command_inventory;truth=${commandInventoryAnswer.truth.status};score=${commandInventoryAnswer.truth.score.toFixed(2)}`,
                });
            }
            return;
        }
        const commandSubcommandFlowAnswer = buildCommandSubcommandFlowDeterministicAnswer(cwd, question, searchTerms, maxCitations);
        if (commandSubcommandFlowAnswer) {
            emitAskResult(commandSubcommandFlowAnswer, {
                json: options.json,
                maxCitations,
                fromPlan: options.fromPlan,
                verbose: options.verbose,
                proof: options.proof,
            });
            if (orgId && projectId) {
                (0, brain_context_1.recordBrainProgressEvent)(cwd, scope, {
                    type: 'ask',
                    note: `mode=deterministic;reason=command_subcommand_flow;truth=${commandSubcommandFlowAnswer.truth.status};score=${commandSubcommandFlowAnswer.truth.score.toFixed(2)}`,
                });
            }
            return;
        }
        const askCacheFlowAnswer = buildAskCacheFlowDeterministicAnswer(cwd, question, searchTerms, maxCitations);
        if (askCacheFlowAnswer) {
            emitAskResult(askCacheFlowAnswer, {
                json: options.json,
                maxCitations,
                fromPlan: options.fromPlan,
                verbose: options.verbose,
                proof: options.proof,
            });
            if (orgId && projectId) {
                (0, brain_context_1.recordBrainProgressEvent)(cwd, scope, {
                    type: 'ask',
                    note: `mode=deterministic;reason=ask_cache_flow;truth=${askCacheFlowAnswer.truth.status};score=${askCacheFlowAnswer.truth.score.toFixed(2)}`,
                });
            }
            return;
        }
        if (process.stdout.isTTY && !process.env.CI) {
            (0, neurcode_context_1.ensureDefaultLocalContextFile)(cwd);
        }
        const fileTree = scanFiles(cwd, MAX_SCAN_FILES);
        if (fileTree.length === 0) {
            console.error(chalk.red('❌ No files found in the current project.'));
            process.exit(1);
        }
        const staticContext = (0, neurcode_context_1.loadStaticNeurcodeContext)(cwd, orgId && projectId ? { orgId, projectId } : undefined);
        const policyVersionHash = (0, plan_cache_1.computePolicyVersionHash)(cwd);
        const neurcodeVersion = (0, plan_cache_1.getNeurcodeVersion)();
        const gitFingerprint = (0, plan_cache_1.getGitRepoFingerprint)(cwd);
        const repoFingerprint = gitFingerprint || (0, plan_cache_1.getFilesystemFingerprintFromTree)(fileTree, cwd);
        if (orgId && projectId) {
            try {
                (0, brain_context_1.refreshBrainContextFromWorkspace)(cwd, scope, {
                    workingTreeHash: gitFingerprint?.kind === 'git' ? gitFingerprint.workingTreeHash : undefined,
                    maxFiles: 90,
                    recordEvent: false,
                });
            }
            catch {
                // Non-blocking.
            }
        }
        if (shouldUseCache && orgId && projectId) {
            const questionHash = (0, ask_cache_1.computeAskQuestionHash)({
                question: searchTerms.normalizedQuestion,
                contextHash: staticContext.hash,
            });
            const exactKey = (0, ask_cache_1.computeAskCacheKey)({
                schemaVersion: 3,
                orgId,
                projectId,
                repo: repoFingerprint,
                questionHash,
                policyVersionHash,
                neurcodeVersion,
            });
            const exact = (0, ask_cache_1.readCachedAsk)(cwd, exactKey);
            if (exact) {
                const exactOutput = {
                    ...exact.output,
                    question,
                    questionNormalized: searchTerms.normalizedQuestion,
                };
                emitAskResult(exactOutput, {
                    json: options.json,
                    maxCitations,
                    cacheLabel: `Using cached answer (created: ${new Date(exact.createdAt).toLocaleString()})`,
                    fromPlan: options.fromPlan,
                    verbose: options.verbose,
                    proof: options.proof,
                });
                (0, brain_context_1.recordBrainProgressEvent)(cwd, scope, {
                    type: 'ask',
                    note: 'cache_hit=exact',
                });
                return;
            }
            const near = (0, ask_cache_1.findNearCachedAsk)(cwd, {
                orgId,
                projectId,
                repo: repoFingerprint,
                question: searchTerms.normalizedQuestion,
                policyVersionHash,
                neurcodeVersion,
                contextHash: staticContext.hash,
                changedPaths: (0, ask_cache_1.getChangedWorkingTreePaths)(cwd),
                minSimilarity: 0.72,
            });
            if (near) {
                const nearOutput = {
                    ...near.entry.output,
                    question,
                    questionNormalized: searchTerms.normalizedQuestion,
                };
                const reasonText = near.reason === 'safe_repo_drift_similar_question'
                    ? 'Using near-cached answer (safe repo drift)'
                    : 'Using near-cached answer';
                emitAskResult(nearOutput, {
                    json: options.json,
                    maxCitations,
                    cacheLabel: `${reasonText}, similarity ${near.similarity.toFixed(2)}, created: ${new Date(near.entry.createdAt).toLocaleString()}`,
                    fromPlan: options.fromPlan,
                    verbose: options.verbose,
                    proof: options.proof,
                });
                (0, brain_context_1.recordBrainProgressEvent)(cwd, scope, {
                    type: 'ask',
                    note: `cache_hit=near;similarity=${near.similarity.toFixed(2)};reason=${near.reason}`,
                });
                return;
            }
        }
        if (!options.json) {
            console.log(chalk.dim(`🧠 Asking repo context in ${cwd}...`));
        }
        const brainResults = orgId && projectId
            ? (0, brain_context_1.searchBrainContextEntries)(cwd, scope, searchTerms.normalizedQuestion, { limit: 64 })
            : { entries: [], totalIndexedFiles: 0 };
        const pathBoostScores = new Map();
        for (const entry of brainResults.entries) {
            pathBoostScores.set(entry.path, Math.max(pathBoostScores.get(entry.path) || 0, entry.score));
        }
        const evidence = collectRepoEvidence(cwd, fileTree, searchTerms, pathBoostScores);
        const sourceEvidence = evidence.scoredCitations.filter((citation) => isPrimarySourcePath(citation.path));
        const finalCitations = selectTopCitations(sourceEvidence, maxCitations, searchTerms);
        const stats = {
            scannedFiles: evidence.scannedFiles,
            matchedFiles: new Set(sourceEvidence.map((citation) => citation.path)).size,
            matchedLines: sourceEvidence.length,
            brainCandidates: brainResults.entries.length,
        };
        const truth = evaluateTruth(searchTerms.normalizedQuestion, searchTerms.highSignalTerms, finalCitations);
        const payload = buildRepoAnswerPayload(question, searchTerms, finalCitations, stats, truth);
        emitAskResult(payload, {
            json: options.json,
            maxCitations,
            fromPlan: options.fromPlan,
            verbose: options.verbose,
            proof: options.proof,
        });
        if (orgId && projectId) {
            (0, brain_context_1.recordBrainProgressEvent)(cwd, scope, {
                type: 'ask',
                note: `mode=retrieval;truth=${truth.status};score=${truth.score.toFixed(2)};matched_files=${stats.matchedFiles};matched_lines=${stats.matchedLines}`,
            });
        }
        if (shouldUseCache && orgId && projectId) {
            const questionHash = (0, ask_cache_1.computeAskQuestionHash)({
                question: searchTerms.normalizedQuestion,
                contextHash: staticContext.hash,
            });
            const key = (0, ask_cache_1.computeAskCacheKey)({
                schemaVersion: 3,
                orgId,
                projectId,
                repo: repoFingerprint,
                questionHash,
                policyVersionHash,
                neurcodeVersion,
            });
            (0, ask_cache_1.writeCachedAsk)(cwd, {
                key,
                input: {
                    schemaVersion: 3,
                    orgId,
                    projectId,
                    repo: repoFingerprint,
                    questionHash,
                    policyVersionHash,
                    neurcodeVersion,
                    question: searchTerms.normalizedQuestion,
                    contextHash: staticContext.hash,
                },
                output: payload,
                evidencePaths: finalCitations.map((citation) => citation.path),
            });
        }
    }
    catch (error) {
        console.error(chalk.red('\n❌ Error answering question:'));
        if (error instanceof Error) {
            console.error(chalk.red(error.message));
        }
        else {
            console.error(error);
        }
        process.exit(1);
    }
}
//# sourceMappingURL=ask.js.map