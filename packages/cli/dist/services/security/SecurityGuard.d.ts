/**
 * Security Guard - Shadow AI Shield
 *
 * Local privacy scanner that runs before any API call to detect and mask secrets.
 * Uses regex patterns and AST analysis (via ts-morph) to identify sensitive data.
 * Also includes hallucination detection for phantom packages.
 */
export interface SecretDetection {
    type: 'aws_key' | 'bearer_token' | 'github_token' | 'generic_secret' | 'ast_literal';
    severity: 'high' | 'medium' | 'low';
    location: string;
    pattern: string;
    masked?: boolean;
}
export interface HallucinationDetection {
    packageName: string;
    location: string;
    importStatement: string;
}
export interface ScanResult {
    secrets: SecretDetection[];
    hasSecrets: boolean;
    maskedText?: string;
}
export interface HallucinationScanResult {
    hallucinations: HallucinationDetection[];
    hasHallucinations: boolean;
    blocked: boolean;
}
interface FileScanOptions {
    maxFiles?: number;
    maxFileBytes?: number;
    maxTotalBytes?: number;
    maxAstFiles?: number;
}
/**
 * Security Guard for local secret detection and hallucination detection
 */
export declare class SecurityGuard {
    private readonly REDACTION_PLACEHOLDER;
    private readonly DEFAULT_MAX_SCAN_FILES;
    private readonly DEFAULT_MAX_FILE_BYTES;
    private readonly DEFAULT_MAX_TOTAL_BYTES;
    private readonly DEFAULT_MAX_AST_FILES;
    private readonly SKIP_FILE_EXTENSIONS;
    private readonly patterns;
    private readonly sensitiveVarNames;
    private readonly safePackageList;
    /**
     * Scan text content for secrets using regex patterns
     */
    scanText(text: string, location?: string): SecretDetection[];
    /**
     * Extract package names from import/require statements (GREEDY - catches all patterns)
     * Returns array of { packageName, importStatement }
     */
    private extractPackageImports;
    /**
     * Load package.json dependencies from project root
     */
    private loadProjectDependencies;
    /**
     * Extract package names mentioned in text (heuristic for plan summaries/reasons)
     * Looks for patterns like: 'package-name', "package-name", library 'package-name', etc.
     */
    private extractPackageMentions;
    /**
     * Scan code for hallucinated packages (phantom packages)
     * Checks against safe list and project's package.json
     * Now includes heuristic detection for package names mentioned in text (not just import statements)
     *
     * PRO feature only - FREE users get a message to upgrade
     */
    scanForHallucinations(code: string, location?: string, rootDir?: string, options?: {
        includeTextMentions?: boolean;
    }): Promise<HallucinationScanResult>;
    /**
     * Scan TypeScript/JavaScript files using AST analysis
     */
    private normalizeRelativePath;
    private resolvePathWithinRoot;
    private shouldSkipScanFileByExtension;
    private readPositiveIntEnv;
    scanFile(filePath: string, rootDir?: string, options?: {
        allowAst?: boolean;
        maxFileBytes?: number;
    }): Promise<SecretDetection[]>;
    /**
     * Scan multiple files
     */
    scanFiles(filePaths: string[], rootDir?: string, options?: FileScanOptions): Promise<ScanResult>;
    /**
     * Scan intent string for secrets
     */
    scanIntent(intent: string): ScanResult;
    /**
     * Mask secrets in text
     */
    maskSecrets(text: string, detections: SecretDetection[]): string;
    /**
     * Complete scan with masking
     */
    scanAndMask(intent: string, filePaths: string[], rootDir?: string): Promise<ScanResult & {
        maskedIntent?: string;
        maskedFiles?: Map<string, string>;
    }>;
}
export {};
//# sourceMappingURL=SecurityGuard.d.ts.map