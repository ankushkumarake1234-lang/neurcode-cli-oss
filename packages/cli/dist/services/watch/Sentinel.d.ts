import { Syncer } from './Syncer';
/**
 * Sentinel - File system watcher that records file changes
 *
 * Watches the project root for file changes, stores content in BlobStore,
 * and records events in Journal. Uses debouncing to prevent high CPU usage.
 */
export declare class Sentinel {
    private watcher;
    private blobStore;
    private journal;
    private syncer;
    private sessionId;
    private projectRoot;
    private projectId;
    private brainScope;
    private debounceTimer;
    private pendingChanges;
    private readonly debounceMs;
    constructor(projectRoot: string, projectId: string, orgId?: string | null);
    /**
     * Initialize the watch service
     */
    initialize(): Promise<void>;
    /**
     * Start watching the project root
     */
    start(): Promise<void>;
    /**
     * Handle a file change event (with debouncing)
     */
    private handleChange;
    /**
     * Process all pending changes after debounce period
     */
    private processPendingChanges;
    /**
     * Stop watching
     */
    stop(): Promise<void>;
    /**
     * Get the current session ID
     */
    getSessionId(): string;
    /**
     * Get the syncer instance (for checking sync status)
     */
    getSyncer(): Syncer;
}
//# sourceMappingURL=Sentinel.d.ts.map