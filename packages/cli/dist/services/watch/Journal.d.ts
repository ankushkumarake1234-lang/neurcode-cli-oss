export interface Session {
    id: string;
    startTime: number;
}
export interface Event {
    id?: number;
    sessionId: string;
    filePath: string;
    hash: string;
    timestamp: number;
}
/**
 * Journal - JSON database for tracking file change history
 *
 * Stores sessions and events in .neurcode/history.json
 */
export declare class Journal {
    private db;
    private readonly dbPath;
    private nextEventId;
    constructor(projectRoot: string);
    /**
     * Create a new session
     * @returns The session ID
     */
    createSession(): string;
    /**
     * Record a file change event
     * @param sessionId - The session ID
     * @param filePath - The path to the changed file
     * @param hash - The SHA-256 hash of the file content
     */
    recordEvent(sessionId: string, filePath: string, hash: string): void;
    /**
     * Get all events for a session
     * @param sessionId - The session ID
     * @returns Array of events
     */
    getSessionEvents(sessionId: string): Event[];
    /**
     * Get all events for a file
     * @param filePath - The file path
     * @returns Array of events
     */
    getFileEvents(filePath: string): Event[];
    /**
     * Get the latest event for a file
     * @param filePath - The file path
     * @returns The latest event or null
     */
    getLatestFileEvent(filePath: string): Event | null;
    /**
     * Close the database connection
     * Note: lowdb doesn't require explicit closing, but we keep this for API compatibility
     */
    close(): void;
}
//# sourceMappingURL=Journal.d.ts.map