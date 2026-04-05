/**
 * .neurcodeignore support for filtering build artifacts and noise from verification.
 */
/**
 * Load .neurcodeignore from workingDir and return a filter function.
 * Paths for which the filter returns true should be excluded from verification.
 *
 * @param workingDir - Directory containing .neurcodeignore (e.g. process.cwd())
 * @returns (path: string) => true if path should be ignored
 */
export declare function loadIgnore(workingDir: string): (path: string) => boolean;
//# sourceMappingURL=ignore.d.ts.map