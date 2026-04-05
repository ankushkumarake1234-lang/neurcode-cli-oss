/**
 * Revert Command
 *
 * Reverts a file to a specific version from Neurcode's version history.
 */
interface RevertOptions {
    toVersion: number;
    projectId?: string;
    reason?: string;
    dryRun?: boolean;
    backup?: boolean;
    force?: boolean;
}
export declare function revertCommand(filePath: string, options: RevertOptions): Promise<void>;
/**
 * List available versions for a file
 */
export declare function listVersionsCommand(filePath: string, options: {
    projectId?: string;
    limit?: number;
}): Promise<void>;
export {};
//# sourceMappingURL=revert.d.ts.map