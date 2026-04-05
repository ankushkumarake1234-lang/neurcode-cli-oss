/**
 * Restore a file from a blob hash
 *
 * Reads a GZIP-compressed blob from .neurcode/blobs/<hash> and
 * writes it to the target file path.
 *
 * @param hash - SHA-256 hash of the file content
 * @param targetPath - Relative path to the file to restore (e.g., "src/components/Button.tsx")
 * @param projectRoot - Root directory of the project
 * @returns Promise that resolves when the file is restored
 * @throws Error if the blob doesn't exist, path is invalid, or write fails
 */
export declare function restoreFile(hash: string, targetPath: string, projectRoot: string): Promise<void>;
//# sourceMappingURL=restore.d.ts.map