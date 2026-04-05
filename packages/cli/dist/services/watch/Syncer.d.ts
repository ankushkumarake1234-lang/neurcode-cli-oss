/**
 * Syncer - Cloud sync service for Time Machine events
 *
 * Pushes file change events to the cloud API in a fire-and-forget manner.
 * If API key is not configured, operates in local-only mode (silent failure).
 */
export interface SyncEvent {
    sessionId: string;
    filePath: string;
    hash: string;
    timestamp: number;
}
export interface SyncResult {
    success: boolean;
    synced: number;
    skipped: number;
    error?: string;
}
/**
 * Syncer - Handles cloud sync of history events
 */
export declare class Syncer {
    private apiUrl;
    private apiKey;
    private projectRoot;
    private projectId;
    private syncQueue;
    private syncTimer;
    private readonly batchSize;
    private readonly debounceMs;
    constructor(projectRoot: string, projectId: string);
    /**
     * Queue an event for sync (non-blocking)
     * @param event - The event to sync
     */
    queueEvent(event: SyncEvent): void;
    /**
     * Sync a batch of events to the cloud
     * @returns Sync result
     */
    private syncBatch;
    /**
     * Force sync all pending events (useful for shutdown)
     */
    flush(): Promise<SyncResult>;
    /**
     * Check if syncer is configured (has API key)
     */
    isConfigured(): boolean;
    /**
     * Reload API key from config (useful if user logs in after watch starts)
     */
    reloadConfig(): void;
}
//# sourceMappingURL=Syncer.d.ts.map