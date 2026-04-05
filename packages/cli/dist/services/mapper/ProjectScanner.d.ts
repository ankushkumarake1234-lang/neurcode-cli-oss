export interface ExportItem {
    name: string;
    filePath: string;
    signature?: string;
    type: 'function' | 'class' | 'interface' | 'type' | 'const' | 'variable' | 'enum' | 'namespace' | 'default' | 'unknown';
}
export interface ImportItem {
    from: string;
    imports: string[];
    isTypeOnly: boolean;
}
export interface FileMetadata {
    filePath: string;
    exports: ExportItem[];
    imports: ImportItem[];
}
export interface ProjectMap {
    files: Record<string, FileMetadata>;
    globalExports: ExportItem[];
    scannedAt: string;
    scanStats?: ProjectScanStats;
    scanContext?: ProjectMapContext;
}
export interface ProjectMapContext {
    adaptiveIntentFingerprint?: string | null;
}
interface ProjectScannerOptions {
    maxSourceFiles?: number;
    maxFileBytes?: number;
    shallowScanBytes?: number;
    shallowScanWindows?: number;
    adaptiveDeepenIntent?: string;
    maxAdaptiveDeepenFiles?: number;
    maxAdaptiveDeepenTotalBytes?: number;
    enableAdaptiveEscalation?: boolean;
    adaptiveEscalationShallowRatioThreshold?: number;
    adaptiveEscalationMinCandidates?: number;
    maxAdaptiveEscalationFiles?: number;
    maxAdaptiveEscalationTotalBytes?: number;
}
export interface ProjectScanStats {
    indexedSourceFiles: number;
    parsedSourceFiles: number;
    parseFailures: number;
    shallowIndexedSourceFiles: number;
    shallowIndexFailures: number;
    adaptiveDeepenCandidates: number;
    adaptiveDeepenedFiles: number;
    adaptiveDeepenFailures: number;
    adaptiveDeepenSkippedBudget: number;
    adaptiveEscalationTriggered: boolean;
    adaptiveEscalationReason: 'shallow_pressure' | 'no_initial_deepening' | null;
    adaptiveEscalationDeepenedFiles: number;
    adaptiveEscalationSkippedBudget: number;
    maxSourceFiles: number;
    maxFileBytes: number;
    shallowScanBytes: number;
    shallowScanWindows: number;
    maxAdaptiveDeepenFiles: number;
    maxAdaptiveDeepenTotalBytes: number;
    maxAdaptiveEscalationFiles: number;
    maxAdaptiveEscalationTotalBytes: number;
    cappedByMaxSourceFiles: boolean;
    skippedByIgnoredDirectory: number;
    skippedBySymlink: number;
    skippedByExtension: number;
    skippedBySize: number;
    skippedUnreadable: number;
}
export declare class ProjectScanner {
    private project;
    private rootDir;
    private maxSourceFiles;
    private maxFileBytes;
    private shallowScanBytes;
    private shallowScanWindows;
    private adaptiveDeepenIntent;
    private maxAdaptiveDeepenFiles;
    private maxAdaptiveDeepenTotalBytes;
    private enableAdaptiveEscalation;
    private adaptiveEscalationShallowRatioThreshold;
    private adaptiveEscalationMinCandidates;
    private maxAdaptiveEscalationFiles;
    private maxAdaptiveEscalationTotalBytes;
    private scanStats;
    private deepenedShallowFiles;
    constructor(rootDir?: string, options?: ProjectScannerOptions);
    private createEmptyScanStats;
    /**
     * Scan the project and extract exports and imports
     */
    scan(): Promise<ProjectMap>;
    /**
     * Find all TypeScript/JavaScript source files
     */
    private findSourceFiles;
    private shouldSkipDirectory;
    private getFileScanDecision;
    private extractShallowMetadata;
    private readShallowTextSample;
    private extractShallowExports;
    private extractShallowImports;
    private maybeRunAdaptiveEscalation;
    private adaptiveDeepenShallowFiles;
    private getIntentTokens;
    private computeIntentFingerprint;
    private computeAdaptiveDeepenScore;
    /**
     * Extract all exports from a source file
     */
    private extractExports;
    /**
     * Create an ExportItem from a declaration node
     */
    private createExportItem;
    /**
     * Get function signature as a string
     */
    private getFunctionSignature;
    /**
     * Extract all imports from a source file
     */
    private extractImports;
}
export {};
//# sourceMappingURL=ProjectScanner.d.ts.map