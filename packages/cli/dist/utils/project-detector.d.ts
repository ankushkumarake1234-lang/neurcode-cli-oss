/**
 * Project Detector Utility
 *
 * Detects project information from the current directory:
 * 1. Git remote URL (primary)
 * 2. package.json name (fallback)
 * 3. Directory name (last resort)
 */
export interface ProjectInfo {
    gitUrl: string | null;
    name: string | null;
    source: 'git' | 'package.json' | 'directory';
}
/**
 * Detect project information from current directory
 *
 * Priority:
 * 1. Git remote URL (best - unique identifier)
 * 2. package.json name (good - semantic name)
 * 3. Directory name (fallback - always available)
 */
export declare function detectProject(): ProjectInfo;
/**
 * Check if current directory is a Git repository
 */
export declare function isGitRepository(): boolean;
//# sourceMappingURL=project-detector.d.ts.map