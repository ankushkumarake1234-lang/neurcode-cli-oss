"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectScanner = void 0;
const ts_morph_1 = require("ts-morph");
const crypto_1 = require("crypto");
const path_1 = require("path");
const fs_1 = require("fs");
const DEFAULT_MAX_SOURCE_FILES = 1200;
const DEFAULT_MAX_FILE_BYTES = 1024 * 1024; // 1MB
const DEFAULT_SHALLOW_SCAN_BYTES = 256 * 1024; // 256KB head/tail sample
const DEFAULT_SHALLOW_SCAN_WINDOWS = 5; // stratified windows across oversized files
const DEFAULT_MAX_ADAPTIVE_DEEPEN_FILES = 3;
const DEFAULT_MAX_ADAPTIVE_DEEPEN_TOTAL_BYTES = 2 * 1024 * 1024; // 2MB
const DEFAULT_ENABLE_ADAPTIVE_ESCALATION = true;
const DEFAULT_ADAPTIVE_ESCALATION_SHALLOW_RATIO_THRESHOLD = 0.35;
const DEFAULT_ADAPTIVE_ESCALATION_MIN_CANDIDATES = 3;
const DEFAULT_MAX_ADAPTIVE_ESCALATION_FILES = 2;
const DEFAULT_MAX_ADAPTIVE_ESCALATION_TOTAL_BYTES = 1024 * 1024; // 1MB
const MAX_SHALLOW_EXPORTS_PER_FILE = 120;
const SOURCE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx']);
const IGNORED_DIR_NAMES = new Set([
    'node_modules',
    '.git',
    '.next',
    'dist',
    'build',
    '.turbo',
    '.cache',
    '.pnpm-store',
    '.yarn',
    '.idea',
    '.vscode',
]);
class ProjectScanner {
    project;
    rootDir;
    maxSourceFiles;
    maxFileBytes;
    shallowScanBytes;
    shallowScanWindows;
    adaptiveDeepenIntent;
    maxAdaptiveDeepenFiles;
    maxAdaptiveDeepenTotalBytes;
    enableAdaptiveEscalation;
    adaptiveEscalationShallowRatioThreshold;
    adaptiveEscalationMinCandidates;
    maxAdaptiveEscalationFiles;
    maxAdaptiveEscalationTotalBytes;
    scanStats;
    deepenedShallowFiles = new Set();
    constructor(rootDir = process.cwd(), options) {
        this.rootDir = (0, path_1.resolve)(rootDir);
        this.project = new ts_morph_1.Project({
            tsConfigFilePath: undefined, // We'll add files manually
            skipAddingFilesFromTsConfig: true,
            skipFileDependencyResolution: true,
        });
        this.maxSourceFiles = Math.max(1, Math.floor(options?.maxSourceFiles || DEFAULT_MAX_SOURCE_FILES));
        this.maxFileBytes = Math.max(1, Math.floor(options?.maxFileBytes || DEFAULT_MAX_FILE_BYTES));
        this.shallowScanBytes = Math.max(1024, Math.floor(options?.shallowScanBytes || DEFAULT_SHALLOW_SCAN_BYTES));
        this.shallowScanWindows = Math.max(1, Math.floor(options?.shallowScanWindows || DEFAULT_SHALLOW_SCAN_WINDOWS));
        this.adaptiveDeepenIntent = (options?.adaptiveDeepenIntent || '').trim();
        this.maxAdaptiveDeepenFiles = Math.max(0, Math.floor(options?.maxAdaptiveDeepenFiles ?? DEFAULT_MAX_ADAPTIVE_DEEPEN_FILES));
        this.maxAdaptiveDeepenTotalBytes = Math.max(0, Math.floor(options?.maxAdaptiveDeepenTotalBytes ?? DEFAULT_MAX_ADAPTIVE_DEEPEN_TOTAL_BYTES));
        this.enableAdaptiveEscalation = options?.enableAdaptiveEscalation ?? DEFAULT_ENABLE_ADAPTIVE_ESCALATION;
        const adaptiveEscalationRatioRaw = options?.adaptiveEscalationShallowRatioThreshold;
        this.adaptiveEscalationShallowRatioThreshold = Number.isFinite(adaptiveEscalationRatioRaw)
            ? Math.min(1, Math.max(0, Number(adaptiveEscalationRatioRaw)))
            : DEFAULT_ADAPTIVE_ESCALATION_SHALLOW_RATIO_THRESHOLD;
        this.adaptiveEscalationMinCandidates = Math.max(1, Math.floor(options?.adaptiveEscalationMinCandidates ?? DEFAULT_ADAPTIVE_ESCALATION_MIN_CANDIDATES));
        this.maxAdaptiveEscalationFiles = Math.max(0, Math.floor(options?.maxAdaptiveEscalationFiles ?? DEFAULT_MAX_ADAPTIVE_ESCALATION_FILES));
        this.maxAdaptiveEscalationTotalBytes = Math.max(0, Math.floor(options?.maxAdaptiveEscalationTotalBytes ?? DEFAULT_MAX_ADAPTIVE_ESCALATION_TOTAL_BYTES));
        this.scanStats = this.createEmptyScanStats();
    }
    createEmptyScanStats() {
        return {
            indexedSourceFiles: 0,
            parsedSourceFiles: 0,
            parseFailures: 0,
            shallowIndexedSourceFiles: 0,
            shallowIndexFailures: 0,
            adaptiveDeepenCandidates: 0,
            adaptiveDeepenedFiles: 0,
            adaptiveDeepenFailures: 0,
            adaptiveDeepenSkippedBudget: 0,
            adaptiveEscalationTriggered: false,
            adaptiveEscalationReason: null,
            adaptiveEscalationDeepenedFiles: 0,
            adaptiveEscalationSkippedBudget: 0,
            maxSourceFiles: this.maxSourceFiles,
            maxFileBytes: this.maxFileBytes,
            shallowScanBytes: this.shallowScanBytes,
            shallowScanWindows: this.shallowScanWindows,
            maxAdaptiveDeepenFiles: this.maxAdaptiveDeepenFiles,
            maxAdaptiveDeepenTotalBytes: this.maxAdaptiveDeepenTotalBytes,
            maxAdaptiveEscalationFiles: this.maxAdaptiveEscalationFiles,
            maxAdaptiveEscalationTotalBytes: this.maxAdaptiveEscalationTotalBytes,
            cappedByMaxSourceFiles: false,
            skippedByIgnoredDirectory: 0,
            skippedBySymlink: 0,
            skippedByExtension: 0,
            skippedBySize: 0,
            skippedUnreadable: 0,
        };
    }
    /**
     * Scan the project and extract exports and imports
     */
    async scan() {
        this.scanStats = this.createEmptyScanStats();
        this.deepenedShallowFiles.clear();
        const adaptiveIntentTokens = this.getIntentTokens(this.adaptiveDeepenIntent);
        const adaptiveIntentFingerprint = this.computeIntentFingerprint(adaptiveIntentTokens);
        // Find all TypeScript/JavaScript files (size-aware mode: full AST or shallow)
        const files = this.findSourceFiles();
        this.scanStats.indexedSourceFiles = files.length;
        // Add full-mode files to ts-morph project
        const sourceFiles = [];
        for (const file of files) {
            if (file.mode !== 'full')
                continue;
            try {
                const sourceFile = this.project.addSourceFileAtPath(file.fullPath);
                sourceFiles.push(sourceFile);
            }
            catch (error) {
                // Skip files that can't be parsed
                this.scanStats.parseFailures += 1;
                continue;
            }
        }
        this.scanStats.parsedSourceFiles = sourceFiles.length;
        this.scanStats.shallowIndexedSourceFiles = files.filter((file) => file.mode === 'shallow').length;
        // Extract metadata from each file
        const fileMetadata = {};
        for (const sourceFile of sourceFiles) {
            const filePath = (0, path_1.relative)(this.rootDir, sourceFile.getFilePath());
            try {
                const exports = this.extractExports(sourceFile, filePath);
                const imports = this.extractImports(sourceFile);
                fileMetadata[filePath] = {
                    filePath,
                    exports,
                    imports,
                };
            }
            catch (error) {
                // If extraction fails for a file, continue with others
                fileMetadata[filePath] = {
                    filePath,
                    exports: [],
                    imports: [],
                };
            }
        }
        // Process oversized files using bounded shallow symbol/import extraction.
        for (const file of files) {
            if (file.mode !== 'shallow')
                continue;
            const relativePath = (0, path_1.relative)(this.rootDir, file.fullPath);
            const shallowMetadata = this.extractShallowMetadata(file.fullPath, relativePath);
            if (!shallowMetadata) {
                this.scanStats.shallowIndexFailures += 1;
                continue;
            }
            fileMetadata[relativePath] = shallowMetadata;
        }
        // Deepen a small, intent-relevant subset of oversized files with full AST parsing.
        const baseDeepen = this.adaptiveDeepenShallowFiles(files, fileMetadata, adaptiveIntentTokens, {
            maxFiles: this.maxAdaptiveDeepenFiles,
            maxTotalBytes: this.maxAdaptiveDeepenTotalBytes,
        });
        this.maybeRunAdaptiveEscalation(files, fileMetadata, adaptiveIntentTokens, baseDeepen);
        const globalExports = [];
        for (const metadata of Object.values(fileMetadata)) {
            globalExports.push(...metadata.exports);
        }
        return {
            files: fileMetadata,
            globalExports,
            scannedAt: new Date().toISOString(),
            scanStats: { ...this.scanStats },
            scanContext: {
                adaptiveIntentFingerprint,
            },
        };
    }
    /**
     * Find all TypeScript/JavaScript source files
     */
    findSourceFiles() {
        const results = [];
        const stack = [this.rootDir];
        let capped = false;
        while (stack.length > 0 && results.length < this.maxSourceFiles) {
            const currentDir = stack.pop();
            let entries;
            try {
                entries = (0, fs_1.readdirSync)(currentDir, { withFileTypes: true, encoding: 'utf8' });
            }
            catch {
                this.scanStats.skippedUnreadable += 1;
                continue;
            }
            for (const entry of entries) {
                if (results.length >= this.maxSourceFiles) {
                    capped = true;
                    break;
                }
                const fullPath = (0, path_1.join)(currentDir, entry.name);
                if (entry.isSymbolicLink()) {
                    // Skip symlinks so we never traverse outside repo boundaries.
                    this.scanStats.skippedBySymlink += 1;
                    continue;
                }
                if (entry.isDirectory()) {
                    if (this.shouldSkipDirectory(entry.name)) {
                        this.scanStats.skippedByIgnoredDirectory += 1;
                        continue;
                    }
                    stack.push(fullPath);
                    continue;
                }
                if (!entry.isFile()) {
                    this.scanStats.skippedByExtension += 1;
                    continue;
                }
                const decision = this.getFileScanDecision(entry.name, fullPath);
                if (decision.mode === 'skip') {
                    if (decision.reason === 'read')
                        this.scanStats.skippedUnreadable += 1;
                    else
                        this.scanStats.skippedByExtension += 1;
                    continue;
                }
                if (decision.mode === 'shallow') {
                    this.scanStats.skippedBySize += 1; // skipped from full AST parse due to size; handled by shallow indexing
                }
                results.push({ fullPath, mode: decision.mode, size: decision.size || 0 });
            }
        }
        if (!capped && results.length >= this.maxSourceFiles && stack.length > 0) {
            capped = true;
        }
        this.scanStats.cappedByMaxSourceFiles = capped;
        return results.sort((a, b) => a.fullPath.localeCompare(b.fullPath));
    }
    shouldSkipDirectory(name) {
        if (IGNORED_DIR_NAMES.has(name))
            return true;
        // Skip hidden directories except ".neurcode" when someone intentionally stores JS there.
        if (name.startsWith('.') && name !== '.neurcode')
            return true;
        return false;
    }
    getFileScanDecision(name, fullPath) {
        if (name.endsWith('.map') || name.endsWith('.log'))
            return { mode: 'skip', reason: 'ext' };
        const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : '';
        if (!SOURCE_EXTENSIONS.has(ext))
            return { mode: 'skip', reason: 'ext' };
        try {
            const stat = (0, fs_1.statSync)(fullPath);
            if (!stat.isFile())
                return { mode: 'skip', reason: 'ext' };
            if (stat.size > this.maxFileBytes)
                return { mode: 'shallow', size: stat.size };
            return { mode: 'full', size: stat.size };
        }
        catch {
            return { mode: 'skip', reason: 'read' };
        }
    }
    extractShallowMetadata(fullPath, filePath) {
        const sample = this.readShallowTextSample(fullPath);
        if (sample === null)
            return null;
        const exports = this.extractShallowExports(sample, filePath);
        const imports = this.extractShallowImports(sample);
        return {
            filePath,
            exports,
            imports,
        };
    }
    readShallowTextSample(fullPath) {
        let fd = null;
        try {
            const stats = (0, fs_1.statSync)(fullPath);
            if (!stats.isFile())
                return null;
            if (stats.size <= 0)
                return '';
            const budget = Math.min(stats.size, this.shallowScanBytes);
            const desiredWindows = Math.max(1, this.shallowScanWindows);
            const effectiveWindows = Math.max(1, Math.min(desiredWindows, Math.floor(budget / 1024) || 1));
            const windowBytes = Math.max(1, Math.floor(budget / effectiveWindows));
            fd = (0, fs_1.openSync)(fullPath, 'r');
            const maxStart = Math.max(0, stats.size - windowBytes);
            const starts = [];
            if (effectiveWindows <= 1 || maxStart <= 0) {
                starts.push(0);
            }
            else {
                const stride = maxStart / (effectiveWindows - 1);
                for (let index = 0; index < effectiveWindows; index += 1) {
                    starts.push(Math.min(maxStart, Math.max(0, Math.round(index * stride))));
                }
            }
            const uniqueStarts = Array.from(new Set(starts)).sort((a, b) => a - b);
            const windows = [];
            for (const start of uniqueStarts) {
                const bytesToRead = Math.min(windowBytes, stats.size - start);
                if (bytesToRead <= 0)
                    continue;
                const buffer = Buffer.alloc(bytesToRead);
                const read = (0, fs_1.readSync)(fd, buffer, 0, bytesToRead, start);
                if (read <= 0)
                    continue;
                const end = start + read;
                windows.push(`/* neurcode-shallow-scan-window:${start}-${end} */\n${buffer.subarray(0, read).toString('utf8')}`);
            }
            if (windows.length === 0) {
                return null;
            }
            return windows.join('\n/* neurcode-shallow-scan-split */\n');
        }
        catch {
            return null;
        }
        finally {
            if (typeof fd === 'number') {
                try {
                    (0, fs_1.closeSync)(fd);
                }
                catch {
                    // ignore close errors
                }
            }
        }
    }
    extractShallowExports(sample, filePath) {
        const exports = [];
        const seen = new Set();
        const addExport = (name, type, signature) => {
            const cleaned = name.trim();
            if (!cleaned)
                return;
            const key = `${type}:${cleaned}`;
            if (seen.has(key))
                return;
            seen.add(key);
            exports.push({
                name: cleaned,
                filePath,
                type,
                signature,
            });
        };
        const functionPattern = /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
        let match;
        while ((match = functionPattern.exec(sample)) !== null) {
            addExport(match[1], 'function', `function ${match[1]}(...)`);
        }
        const classPattern = /export\s+class\s+([A-Za-z_$][\w$]*)/g;
        while ((match = classPattern.exec(sample)) !== null) {
            addExport(match[1], 'class', `class ${match[1]}`);
        }
        const interfacePattern = /export\s+interface\s+([A-Za-z_$][\w$]*)/g;
        while ((match = interfacePattern.exec(sample)) !== null) {
            addExport(match[1], 'interface', `interface ${match[1]}`);
        }
        const typePattern = /export\s+type\s+([A-Za-z_$][\w$]*)/g;
        while ((match = typePattern.exec(sample)) !== null) {
            addExport(match[1], 'type', `type ${match[1]} = ...`);
        }
        const enumPattern = /export\s+enum\s+([A-Za-z_$][\w$]*)/g;
        while ((match = enumPattern.exec(sample)) !== null) {
            addExport(match[1], 'enum', `enum ${match[1]}`);
        }
        const constPattern = /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;
        while ((match = constPattern.exec(sample)) !== null) {
            addExport(match[1], 'const', `const ${match[1]} = ...`);
        }
        const namedExportPattern = /export\s*\{([^}]+)\}/g;
        while ((match = namedExportPattern.exec(sample)) !== null) {
            const rawGroup = match[1] || '';
            const parts = rawGroup.split(',').map((value) => value.trim()).filter(Boolean);
            for (const part of parts) {
                const aliasParts = part.split(/\s+as\s+/i).map((value) => value.trim()).filter(Boolean);
                const exportedName = aliasParts.length > 1 ? aliasParts[1] : aliasParts[0];
                if (!exportedName || exportedName === 'default')
                    continue;
                addExport(exportedName, 'variable');
            }
        }
        const namespaceExportPattern = /export\s+\*\s+from\s+['"][^'"]+['"]/g;
        while ((match = namespaceExportPattern.exec(sample)) !== null) {
            addExport('*', 'namespace', 'export * from ...');
        }
        const defaultExportPattern = /export\s+default\b/g;
        if (defaultExportPattern.test(sample)) {
            addExport('default', 'default', 'export default ...');
        }
        return exports.slice(0, MAX_SHALLOW_EXPORTS_PER_FILE);
    }
    extractShallowImports(sample) {
        const importsByModule = new Map();
        const upsertImport = (moduleName, symbolName, isTypeOnly) => {
            const normalized = moduleName.trim();
            if (!normalized)
                return;
            const existing = importsByModule.get(normalized);
            if (!existing) {
                importsByModule.set(normalized, {
                    from: normalized,
                    imports: symbolName ? [symbolName] : [],
                    isTypeOnly,
                });
                return;
            }
            existing.isTypeOnly = existing.isTypeOnly && isTypeOnly;
            if (symbolName && !existing.imports.includes(symbolName)) {
                existing.imports.push(symbolName);
            }
        };
        const importFromPattern = /import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
        let match;
        while ((match = importFromPattern.exec(sample)) !== null) {
            const moduleName = match[3];
            const importBody = (match[2] || '').trim();
            const isTypeOnly = Boolean(match[1]);
            if (!importBody) {
                upsertImport(moduleName, '', isTypeOnly);
                continue;
            }
            upsertImport(moduleName, importBody.slice(0, 120), isTypeOnly);
        }
        const sideEffectImportPattern = /import\s+['"]([^'"]+)['"]/g;
        while ((match = sideEffectImportPattern.exec(sample)) !== null) {
            upsertImport(match[1], '', false);
        }
        const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        while ((match = requirePattern.exec(sample)) !== null) {
            upsertImport(match[1], 'require', false);
        }
        const dynamicImportPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        while ((match = dynamicImportPattern.exec(sample)) !== null) {
            upsertImport(match[1], 'dynamic', false);
        }
        return Array.from(importsByModule.values());
    }
    maybeRunAdaptiveEscalation(files, fileMetadata, intentTokens, baseDeepen) {
        if (!this.enableAdaptiveEscalation)
            return;
        if (intentTokens.length === 0)
            return;
        if (this.scanStats.shallowIndexedSourceFiles <= 0)
            return;
        if (this.maxAdaptiveEscalationFiles <= 0 || this.maxAdaptiveEscalationTotalBytes <= 0)
            return;
        const indexedSourceFiles = Math.max(1, this.scanStats.indexedSourceFiles);
        const shallowRatio = this.scanStats.shallowIndexedSourceFiles / indexedSourceFiles;
        const noInitialDeepening = baseDeepen.deepened === 0 && baseDeepen.candidates > 0;
        const shallowPressure = shallowRatio >= this.adaptiveEscalationShallowRatioThreshold;
        const candidateFloorMet = baseDeepen.candidates >= this.adaptiveEscalationMinCandidates || noInitialDeepening;
        if (!candidateFloorMet || (!shallowPressure && !noInitialDeepening)) {
            return;
        }
        this.scanStats.adaptiveEscalationTriggered = true;
        this.scanStats.adaptiveEscalationReason = noInitialDeepening
            ? 'no_initial_deepening'
            : 'shallow_pressure';
        this.adaptiveDeepenShallowFiles(files, fileMetadata, intentTokens, {
            maxFiles: this.maxAdaptiveEscalationFiles,
            maxTotalBytes: this.maxAdaptiveEscalationTotalBytes,
            trackAsEscalation: true,
        });
    }
    adaptiveDeepenShallowFiles(files, fileMetadata, intentTokens, budget) {
        if (intentTokens.length === 0) {
            return { candidates: 0, deepened: 0, skippedBudget: 0 };
        }
        const candidates = files
            .filter((file) => file.mode === 'shallow')
            .map((file) => {
            const filePath = (0, path_1.relative)(this.rootDir, file.fullPath);
            const metadata = fileMetadata[filePath];
            if (!metadata)
                return null;
            const score = this.computeAdaptiveDeepenScore(intentTokens, filePath, metadata);
            if (score <= 0)
                return null;
            return {
                fullPath: file.fullPath,
                filePath,
                size: file.size,
                score,
            };
        })
            .filter((candidate) => Boolean(candidate))
            .filter((candidate) => !this.deepenedShallowFiles.has(candidate.filePath))
            .sort((a, b) => {
            if (b.score !== a.score)
                return b.score - a.score;
            return a.size - b.size;
        });
        this.scanStats.adaptiveDeepenCandidates = Math.max(this.scanStats.adaptiveDeepenCandidates, candidates.length);
        if (candidates.length === 0)
            return { candidates: 0, deepened: 0, skippedBudget: 0 };
        if (budget.maxFiles <= 0 || budget.maxTotalBytes <= 0) {
            return { candidates: candidates.length, deepened: 0, skippedBudget: 0 };
        }
        let remainingFiles = budget.maxFiles;
        let remainingBytes = budget.maxTotalBytes;
        let deepened = 0;
        let skippedBudget = 0;
        for (const candidate of candidates) {
            if (remainingFiles <= 0)
                break;
            if (candidate.size > remainingBytes) {
                skippedBudget += 1;
                if (budget.trackAsEscalation) {
                    this.scanStats.adaptiveEscalationSkippedBudget += 1;
                }
                else {
                    this.scanStats.adaptiveDeepenSkippedBudget += 1;
                }
                continue;
            }
            let sourceFile;
            try {
                sourceFile = this.project.addSourceFileAtPath(candidate.fullPath);
                const exports = this.extractExports(sourceFile, candidate.filePath);
                const imports = this.extractImports(sourceFile);
                fileMetadata[candidate.filePath] = {
                    filePath: candidate.filePath,
                    exports,
                    imports,
                };
                this.deepenedShallowFiles.add(candidate.filePath);
                this.scanStats.adaptiveDeepenedFiles += 1;
                if (budget.trackAsEscalation) {
                    this.scanStats.adaptiveEscalationDeepenedFiles += 1;
                }
                deepened += 1;
                remainingFiles -= 1;
                remainingBytes -= candidate.size;
            }
            catch {
                this.scanStats.adaptiveDeepenFailures += 1;
            }
            finally {
                if (sourceFile) {
                    try {
                        this.project.removeSourceFile(sourceFile);
                    }
                    catch {
                        // ignore remove errors
                    }
                }
            }
        }
        return {
            candidates: candidates.length,
            deepened,
            skippedBudget,
        };
    }
    getIntentTokens(intent) {
        const stopWords = new Set([
            'the', 'and', 'for', 'with', 'that', 'from', 'into', 'this', 'your', 'will', 'have', 'should',
            'about', 'where', 'when', 'what', 'which', 'plan', 'code', 'repo', 'file', 'files', 'create',
            'build', 'add', 'update', 'change', 'make',
        ]);
        const raw = intent.toLowerCase().match(/[a-z0-9_]{3,}/g) || [];
        const deduped = new Set();
        for (const token of raw) {
            if (stopWords.has(token))
                continue;
            deduped.add(token);
            if (deduped.size >= 24)
                break;
        }
        return Array.from(deduped);
    }
    computeIntentFingerprint(tokens) {
        if (tokens.length === 0)
            return null;
        const normalized = [...tokens].sort().join('|');
        return (0, crypto_1.createHash)('sha1').update(normalized, 'utf-8').digest('hex');
    }
    computeAdaptiveDeepenScore(tokens, filePath, metadata) {
        const lowerPath = filePath.toLowerCase();
        const exportText = metadata.exports
            .map((item) => `${item.name} ${item.signature || ''}`.toLowerCase())
            .join(' ');
        const importText = metadata.imports
            .map((item) => `${item.from} ${(item.imports || []).join(' ')}`.toLowerCase())
            .join(' ');
        let score = 0;
        for (const token of tokens) {
            if (lowerPath.includes(token))
                score += 3;
            if (exportText.includes(token))
                score += 2;
            if (importText.includes(token))
                score += 1;
        }
        return score;
    }
    /**
     * Extract all exports from a source file
     */
    extractExports(sourceFile, filePath) {
        const exports = [];
        // Get all export declarations
        const exportDeclarations = sourceFile.getExportedDeclarations();
        for (const [name, declarations] of exportDeclarations) {
            for (const declaration of declarations) {
                const exportItem = this.createExportItem(declaration, name, filePath);
                if (exportItem) {
                    exports.push(exportItem);
                }
            }
        }
        // Check for default exports
        const defaultExport = sourceFile.getDefaultExportSymbol();
        if (defaultExport) {
            const declaration = defaultExport.getValueDeclaration();
            if (declaration) {
                const exportItem = this.createExportItem(declaration, 'default', filePath);
                if (exportItem) {
                    exports.push(exportItem);
                }
            }
        }
        // Check for export * from statements
        const exportStarDeclarations = sourceFile.getExportDeclarations();
        for (const exportDecl of exportStarDeclarations) {
            if (exportDecl.isNamespaceExport()) {
                const moduleSpecifier = exportDecl.getModuleSpecifierValue();
                if (moduleSpecifier) {
                    exports.push({
                        name: '*',
                        filePath,
                        type: 'namespace',
                    });
                }
            }
        }
        return exports;
    }
    /**
     * Create an ExportItem from a declaration node
     */
    createExportItem(declaration, name, filePath) {
        const kind = declaration.getKind();
        let type = 'unknown';
        let signature;
        if (kind === ts_morph_1.SyntaxKind.FunctionDeclaration || kind === ts_morph_1.SyntaxKind.FunctionExpression) {
            type = 'function';
            signature = this.getFunctionSignature(declaration);
        }
        else if (kind === ts_morph_1.SyntaxKind.ClassDeclaration) {
            type = 'class';
            signature = declaration.getText().split('\n')[0] || undefined;
        }
        else if (kind === ts_morph_1.SyntaxKind.InterfaceDeclaration) {
            type = 'interface';
            signature = declaration.getText().split('\n')[0] || undefined;
        }
        else if (kind === ts_morph_1.SyntaxKind.TypeAliasDeclaration) {
            type = 'type';
            signature = declaration.getText().split('\n')[0] || undefined;
        }
        else if (kind === ts_morph_1.SyntaxKind.EnumDeclaration) {
            type = 'enum';
            signature = declaration.getText().split('\n')[0] || undefined;
        }
        else if (kind === ts_morph_1.SyntaxKind.ModuleDeclaration) {
            type = 'namespace';
            signature = declaration.getText().split('\n')[0] || undefined;
        }
        else if (kind === ts_morph_1.SyntaxKind.VariableDeclaration) {
            const varDecl = declaration.asKind(ts_morph_1.SyntaxKind.VariableDeclaration);
            if (varDecl) {
                const initializer = varDecl.getInitializer();
                if (initializer?.getKind() === ts_morph_1.SyntaxKind.ArrowFunction ||
                    initializer?.getKind() === ts_morph_1.SyntaxKind.FunctionExpression) {
                    type = 'function';
                    signature = this.getFunctionSignature(initializer);
                }
                else {
                    type = 'const';
                    signature = varDecl.getText();
                }
            }
            else {
                type = 'variable';
            }
        }
        else if (kind === ts_morph_1.SyntaxKind.Identifier && name === 'default') {
            type = 'default';
        }
        return {
            name,
            filePath,
            signature,
            type,
        };
    }
    /**
     * Get function signature as a string
     */
    getFunctionSignature(node) {
        try {
            const text = node.getText();
            // Extract function signature (name and parameters)
            const match = text.match(/(?:async\s+)?(?:function\s+)?(\w+)?\s*\([^)]*\)/);
            if (match) {
                return match[0];
            }
            // For arrow functions
            const arrowMatch = text.match(/(?:async\s+)?\([^)]*\)\s*=>/);
            if (arrowMatch) {
                return arrowMatch[0];
            }
            return text.split('\n')[0] || '';
        }
        catch {
            return '';
        }
    }
    /**
     * Extract all imports from a source file
     */
    extractImports(sourceFile) {
        const imports = [];
        const importDeclarations = sourceFile.getImportDeclarations();
        for (const importDecl of importDeclarations) {
            const moduleSpecifier = importDecl.getModuleSpecifierValue();
            if (!moduleSpecifier)
                continue;
            const isTypeOnly = importDecl.isTypeOnly();
            const namedImports = [];
            const defaultImport = importDecl.getDefaultImport();
            // Get named imports
            const namedImportsNode = importDecl.getNamedImports();
            if (namedImportsNode) {
                for (const specifier of namedImportsNode) {
                    const importName = specifier.getName();
                    namedImports.push(importName);
                }
            }
            // Get namespace import
            const namespaceImport = importDecl.getNamespaceImport();
            if (namespaceImport) {
                namedImports.push(`* as ${namespaceImport.getText()}`);
            }
            // Combine default and named imports
            const allImports = [];
            if (defaultImport) {
                allImports.push('default');
            }
            allImports.push(...namedImports);
            if (allImports.length > 0 || moduleSpecifier) {
                imports.push({
                    from: moduleSpecifier,
                    imports: allImports,
                    isTypeOnly,
                });
            }
        }
        return imports;
    }
}
exports.ProjectScanner = ProjectScanner;
//# sourceMappingURL=ProjectScanner.js.map