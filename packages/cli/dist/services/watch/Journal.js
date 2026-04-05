"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Journal = void 0;
const path = __importStar(require("path"));
const fsExtra = __importStar(require("fs-extra"));
const uuid_1 = require("uuid");
// @ts-ignore - lowdb v1 doesn't have perfect TypeScript support
const lowdb = require('lowdb');
// @ts-ignore
const FileSync = require('lowdb/adapters/FileSync');
/**
 * Journal - JSON database for tracking file change history
 *
 * Stores sessions and events in .neurcode/history.json
 */
class Journal {
    db; // lowdb.LowdbSync<DatabaseSchema> - using any due to v1.x typing issues
    dbPath;
    nextEventId = 1;
    constructor(projectRoot) {
        this.dbPath = path.join(projectRoot, '.neurcode', 'history.json');
        // Ensure .neurcode directory exists
        fsExtra.ensureDirSync(path.dirname(this.dbPath));
        // Initialize lowdb with JSON file adapter (v1.x API - synchronous)
        const adapter = new FileSync(this.dbPath);
        this.db = lowdb(adapter);
        // Set default data if database is empty
        this.db.defaults({ sessions: [], events: [] }).write();
        // Find the highest event ID to continue auto-incrementing
        if (this.db.get('events').value().length > 0) {
            const maxId = Math.max(...this.db.get('events').value().map((e) => e.id || 0));
            this.nextEventId = maxId + 1;
        }
    }
    /**
     * Create a new session
     * @returns The session ID
     */
    createSession() {
        const sessionId = (0, uuid_1.v4)();
        const startTime = Date.now();
        this.db.get('sessions').push({
            id: sessionId,
            startTime,
        }).write();
        return sessionId;
    }
    /**
     * Record a file change event
     * @param sessionId - The session ID
     * @param filePath - The path to the changed file
     * @param hash - The SHA-256 hash of the file content
     */
    recordEvent(sessionId, filePath, hash) {
        const timestamp = Date.now();
        this.db.get('events').push({
            id: this.nextEventId++,
            sessionId,
            filePath,
            hash,
            timestamp,
        }).write();
    }
    /**
     * Get all events for a session
     * @param sessionId - The session ID
     * @returns Array of events
     */
    getSessionEvents(sessionId) {
        return this.db.get('events')
            .filter((event) => event.sessionId === sessionId)
            .sortBy('timestamp')
            .value();
    }
    /**
     * Get all events for a file
     * @param filePath - The file path
     * @returns Array of events
     */
    getFileEvents(filePath) {
        return this.db.get('events')
            .filter((event) => event.filePath === filePath)
            .sortBy((event) => -event.timestamp)
            .value();
    }
    /**
     * Get the latest event for a file
     * @param filePath - The file path
     * @returns The latest event or null
     */
    getLatestFileEvent(filePath) {
        const events = this.db.get('events')
            .filter((event) => event.filePath === filePath)
            .sortBy((event) => -event.timestamp)
            .value();
        if (events.length === 0) {
            return null;
        }
        return events[0];
    }
    /**
     * Close the database connection
     * Note: lowdb doesn't require explicit closing, but we keep this for API compatibility
     */
    close() {
        // lowdb writes synchronously on write(), so no cleanup needed
        // This method is kept for API compatibility with the previous implementation
    }
}
exports.Journal = Journal;
//# sourceMappingURL=Journal.js.map