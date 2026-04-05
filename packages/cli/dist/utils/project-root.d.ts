/**
 * Neurcode Project Root Resolution
 *
 * Enterprise UX requirement: users should be able to run Neurcode CLI commands
 * from any subdirectory inside a linked project and still use the same
 * `.neurcode/` state, caches, and context.
 *
 * Strategy:
 * - Walk up from the current working directory and pick the nearest ancestor
 *   that contains `.neurcode/config.json` (linked project marker).
 * - Also treat legacy `neurcode.config.json` as a marker for older setups.
 * - If the current directory is inside a git repository, do not search above
 *   that repository root. This prevents accidental cross-repo leakage.
 * - Cross-repo root overrides are denied by default, but can be explicitly
 *   allowed via `.neurcode/repo-links.json` (`neurcode repo link ...`).
 * - If nothing is found, fall back to the starting directory.
 */
import { type RepoLinkEntry } from './repo-links';
type OverrideStatus = 'none' | 'allowed' | 'blocked_cross_repo' | 'blocked_home_guard';
export interface ProjectRootResolutionTrace {
    startDir: string;
    projectRoot: string;
    gitRoot: string | null;
    overrideRequested: string | null;
    overrideResolved: string | null;
    overrideStatus: OverrideStatus;
    overrideBlockedReason?: string;
    linkedRepoRoot: string | null;
    linkedRepos: RepoLinkEntry[];
    linkedRepoOverrideUsed: boolean;
}
export declare function resolveNeurcodeProjectRootWithTrace(startDir?: string): ProjectRootResolutionTrace;
export declare function resolveNeurcodeProjectRoot(startDir?: string): string;
export {};
//# sourceMappingURL=project-root.d.ts.map