/**
 * CommandPoller - Polls for remote commands and executes them locally
 *
 * Polls the cloud API every 3 seconds for pending commands (like file reverts).
 * When a command is received, executes it locally and updates the status.
 */
export interface Command {
    id: string;
    userId: string;
    organizationId: string;
    type: string;
    payload: {
        filePath: string;
        blobHash: string;
    };
    status: string;
    createdAt: string;
    updatedAt: string;
}
export interface PollResponse {
    command: Command | null;
}
/**
 * CommandPoller - Handles polling and execution of remote commands
 */
export declare class CommandPoller {
    private apiUrl;
    private apiKey;
    private projectRoot;
    private pollInterval;
    private readonly pollIntervalMs;
    private isRunning;
    private blobStore;
    constructor(projectRoot: string);
    /**
     * Start polling for commands
     */
    start(): void;
    /**
     * Stop polling for commands
     */
    stop(): void;
    /**
     * Poll for pending commands and execute them
     */
    private poll;
    /**
     * Execute a command locally
     */
    private executeCommand;
    /**
     * Compute the hash of the current file content
     */
    private computeCurrentFileHash;
    /**
     * Execute a FILE_REVERT command
     */
    private executeFileRevert;
    /**
     * Fetch blob content from cloud API and store it locally
     */
    private fetchBlobFromCloud;
    /**
     * Update command status on the server
     */
    private updateCommandStatus;
    /**
     * Check if poller is configured (has API key)
     */
    isConfigured(): boolean;
    /**
     * Reload API key from config (useful if user logs in after watch starts)
     */
    reloadConfig(): void;
}
//# sourceMappingURL=CommandPoller.d.ts.map