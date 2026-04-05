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
exports.Sentinel = void 0;
const chokidar = __importStar(require("chokidar"));
const path = __importStar(require("path"));
const fs_1 = require("fs");
const BlobStore_1 = require("./BlobStore");
const Journal_1 = require("./Journal");
const Syncer_1 = require("./Syncer");
const brain_context_1 = require("../../utils/brain-context");
/**
 * Sentinel - File system watcher that records file changes
 *
 * Watches the project root for file changes, stores content in BlobStore,
 * and records events in Journal. Uses debouncing to prevent high CPU usage.
 */
class Sentinel {
    watcher = null;
    blobStore;
    journal;
    syncer;
    sessionId;
    projectRoot;
    projectId;
    brainScope;
    debounceTimer = null;
    pendingChanges = new Map();
    debounceMs = 500;
    constructor(projectRoot, projectId, orgId = null) {
        this.projectRoot = projectRoot;
        this.projectId = projectId;
        this.brainScope = { orgId, projectId };
        this.blobStore = new BlobStore_1.BlobStore(projectRoot);
        this.journal = new Journal_1.Journal(projectRoot);
        this.syncer = new Syncer_1.Syncer(projectRoot, projectId);
        this.sessionId = this.journal.createSession();
    }
    /**
     * Initialize the watch service
     */
    async initialize() {
        await this.blobStore.initialize();
    }
    /**
     * Start watching the project root
     */
    async start() {
        if (this.watcher) {
            throw new Error('Sentinel is already watching');
        }
        // Ignore patterns for common directories and files
        const ignored = [
            '**/.git/**',
            '**/node_modules/**',
            '**/.neurcode/**',
            '**/.next/**',
            '**/dist/**',
            '**/build/**',
            '**/.DS_Store',
            '**/Thumbs.db',
        ];
        this.watcher = chokidar.watch(this.projectRoot, {
            ignored,
            persistent: true,
            ignoreInitial: true, // Don't process existing files on startup
            awaitWriteFinish: {
                stabilityThreshold: 200,
                pollInterval: 100,
            },
        });
        // Handle file changes
        this.watcher.on('add', (filePath) => this.handleChange(filePath, 'add'));
        this.watcher.on('change', (filePath) => this.handleChange(filePath, 'change'));
        this.watcher.on('unlink', (filePath) => this.handleChange(filePath, 'unlink'));
        this.watcher.on('error', (error) => {
            console.error('❌ Watch error:', error);
        });
        console.log(`👁️  Watching: ${this.projectRoot}`);
        console.log(`📝 Session ID: ${this.sessionId}`);
    }
    /**
     * Handle a file change event (with debouncing)
     */
    handleChange(filePath, eventType) {
        // Normalize path relative to project root
        const relativePath = path.relative(this.projectRoot, filePath).replace(/\\/g, '/');
        if (!relativePath)
            return;
        // Store the most recent event type for this file
        this.pendingChanges.set(relativePath, eventType);
        // Clear existing debounce timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        // Set new debounce timer
        this.debounceTimer = setTimeout(() => {
            this.processPendingChanges();
        }, this.debounceMs);
    }
    /**
     * Process all pending changes after debounce period
     */
    async processPendingChanges() {
        const changes = Array.from(this.pendingChanges.entries());
        this.pendingChanges.clear();
        if (changes.length === 0) {
            return;
        }
        for (const [filePath, eventType] of changes) {
            try {
                if (eventType === 'unlink') {
                    try {
                        (0, brain_context_1.removeBrainFileContext)(this.projectRoot, this.brainScope, filePath);
                        (0, brain_context_1.recordBrainProgressEvent)(this.projectRoot, this.brainScope, {
                            type: 'watch_delete',
                            filePath,
                        });
                    }
                    catch {
                        // Never block watch flow on context indexing failures.
                    }
                    console.log(`🗑️  Removed: ${filePath}`);
                    continue;
                }
                // Read file content
                const fullPath = path.join(this.projectRoot, filePath);
                const content = await fs_1.promises.readFile(fullPath, 'utf-8');
                // Store content in blob store
                const hash = await this.blobStore.store(content);
                // Record event in journal (local JSON database)
                this.journal.recordEvent(this.sessionId, filePath, hash);
                // Queue event for cloud sync (non-blocking, fire-and-forget)
                this.syncer.queueEvent({
                    sessionId: this.sessionId,
                    filePath,
                    hash,
                    timestamp: Date.now(),
                });
                try {
                    const indexed = (0, brain_context_1.upsertBrainFileContextFromContent)(this.projectRoot, this.brainScope, filePath, content);
                    if (indexed.indexed || indexed.updated || indexed.created) {
                        (0, brain_context_1.recordBrainProgressEvent)(this.projectRoot, this.brainScope, {
                            type: 'watch_change',
                            filePath,
                            note: `event=${eventType};created=${indexed.created ? 1 : 0};updated=${indexed.updated ? 1 : 0}`,
                        });
                    }
                }
                catch {
                    // Never block watch flow on context indexing failures.
                }
                console.log(`📝 Recorded: ${filePath} (${hash.substring(0, 8)}...)`);
            }
            catch (error) {
                // Skip files that can't be read (permissions, binary files, etc.)
                if (error instanceof Error) {
                    // Silently skip - this is expected for some files
                }
            }
        }
    }
    /**
     * Stop watching
     */
    async stop() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        if (this.watcher) {
            await this.watcher.close();
            this.watcher = null;
        }
        // Flush any pending syncs before closing
        if (this.syncer.isConfigured()) {
            console.log('☁️  Flushing pending cloud syncs...');
            const result = await this.syncer.flush();
            if (result.success && result.synced > 0) {
                console.log(`✅ Synced ${result.synced} events to cloud`);
            }
        }
        this.journal.close();
        console.log('🛑 Watch stopped');
    }
    /**
     * Get the current session ID
     */
    getSessionId() {
        return this.sessionId;
    }
    /**
     * Get the syncer instance (for checking sync status)
     */
    getSyncer() {
        return this.syncer;
    }
}
exports.Sentinel = Sentinel;
//# sourceMappingURL=Sentinel.js.map