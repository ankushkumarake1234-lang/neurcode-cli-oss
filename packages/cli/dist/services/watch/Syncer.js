"use strict";
/**
 * Syncer - Cloud sync service for Time Machine events
 *
 * Pushes file change events to the cloud API in a fire-and-forget manner.
 * If API key is not configured, operates in local-only mode (silent failure).
 */
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
exports.Syncer = void 0;
const config_1 = require("../../config");
const state_1 = require("../../utils/state");
const fs_1 = require("fs");
const path = __importStar(require("path"));
/**
 * Syncer - Handles cloud sync of history events
 */
class Syncer {
    apiUrl;
    apiKey;
    projectRoot;
    projectId;
    syncQueue = [];
    syncTimer = null;
    batchSize = 10; // Sync in batches
    debounceMs = 2000; // Wait 2 seconds before syncing
    constructor(projectRoot, projectId) {
        this.projectRoot = projectRoot;
        this.projectId = projectId;
        const config = (0, config_1.loadConfig)();
        this.apiUrl = config.apiUrl || config_1.DEFAULT_API_URL;
        this.apiKey = (0, config_1.getApiKey)();
    }
    /**
     * Queue an event for sync (non-blocking)
     * @param event - The event to sync
     */
    queueEvent(event) {
        // If no API key, skip silently (local-only mode)
        if (!this.apiKey) {
            return;
        }
        // Add to queue
        this.syncQueue.push(event);
        // Clear existing timer
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
        }
        // Set new timer to sync after debounce period
        this.syncTimer = setTimeout(() => {
            this.syncBatch().catch((error) => {
                // Silently handle errors - don't block the watch service
                console.error('⚠️  Sync error (non-fatal):', error.message);
            });
        }, this.debounceMs);
    }
    /**
     * Sync a batch of events to the cloud
     * @returns Sync result
     */
    async syncBatch() {
        if (this.syncQueue.length === 0) {
            return { success: true, synced: 0, skipped: 0 };
        }
        // If no API key, clear queue and return
        if (!this.apiKey) {
            const queuedCount = this.syncQueue.length;
            this.syncQueue = [];
            if (queuedCount > 0) {
                console.warn(`⚠️  ${queuedCount} event(s) not synced: No API key configured. Run "neurcode config --key <your_api_key>"`);
            }
            return { success: false, synced: 0, skipped: 0, error: 'No API key configured' };
        }
        // Take a batch from the queue
        const batch = this.syncQueue.splice(0, this.batchSize);
        // Prepare events (metadata only - no content)
        const events = batch.map(event => ({
            sessionId: event.sessionId,
            filePath: event.filePath,
            hash: event.hash,
            timestamp: event.timestamp,
        }));
        // Read blob content for all unique hashes in the batch
        // Send blobs separately for server-side deduplication
        const blobs = {};
        const uniqueHashes = new Set(batch.map(e => e.hash));
        for (const hash of uniqueHashes) {
            try {
                // Try to read the blob content
                const blobPath = path.join(this.projectRoot, '.neurcode', 'blobs', hash);
                const blobContent = await fs_1.promises.readFile(blobPath);
                // Convert to base64 for transmission
                // Server will handle deduplication - we send all blobs, server checks which are new
                blobs[hash] = blobContent.toString('base64');
            }
            catch {
                // If blob doesn't exist or can't be read, skip it
                // The server can still store the event metadata with just the hash
                // This allows events to be recorded even if blob read fails
            }
        }
        try {
            const orgId = (0, state_1.getOrgId)();
            // Make API request with separated events and blobs
            // Format: { events: [...], blobs: { [hash]: base64Content } }
            const response = await fetch(`${this.apiUrl}/api/v1/history/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    ...(orgId ? { 'x-org-id': orgId } : {}),
                },
                body: JSON.stringify({
                    events,
                    blobs, // Separate blobs map for server-side deduplication
                    projectId: this.projectId, // Include projectId so events are associated with the correct project
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API error: ${response.status} ${errorText}`);
            }
            const result = await response.json();
            // Log sync result for visibility
            if (result.success) {
                if (result.synced > 0) {
                    console.log(`✅ Synced ${result.synced} event(s) to cloud${result.skipped > 0 ? ` (${result.skipped} skipped)` : ''}`);
                }
                else if (result.skipped > 0) {
                    // All events were duplicates (already synced)
                    console.log(`ℹ️  All ${result.skipped} event(s) already synced`);
                }
            }
            else {
                console.error(`❌ Sync failed: ${result.error || 'Unknown error'}`);
            }
            // If there are more events in the queue, schedule another sync
            if (this.syncQueue.length > 0) {
                setTimeout(() => {
                    this.syncBatch().catch((error) => {
                        console.error('⚠️  Sync error (non-fatal):', error.message);
                    });
                }, this.debounceMs);
            }
            return result;
        }
        catch (error) {
            // Log error but don't throw - this is fire-and-forget
            console.error(`❌ Failed to sync ${batch.length} event(s) to cloud: ${error.message}`);
            // If it's an auth error, provide helpful message
            if (error.message?.includes('401') || error.message?.includes('403')) {
                console.error('   💡 Tip: Check your API key with "neurcode config --key <your_api_key>"');
            }
            return {
                success: false,
                synced: 0,
                skipped: batch.length,
                error: error.message,
            };
        }
    }
    /**
     * Force sync all pending events (useful for shutdown)
     */
    async flush() {
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
            this.syncTimer = null;
        }
        // Sync all remaining events
        const results = [];
        while (this.syncQueue.length > 0) {
            const result = await this.syncBatch();
            results.push(result);
        }
        // Aggregate results
        const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);
        const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
        const allSuccess = results.every(r => r.success);
        return {
            success: allSuccess,
            synced: totalSynced,
            skipped: totalSkipped,
        };
    }
    /**
     * Check if syncer is configured (has API key)
     */
    isConfigured() {
        return this.apiKey !== null;
    }
    /**
     * Reload API key from config (useful if user logs in after watch starts)
     */
    reloadConfig() {
        const config = (0, config_1.loadConfig)();
        this.apiUrl = config.apiUrl || config_1.DEFAULT_API_URL;
        this.apiKey = (0, config_1.getApiKey)();
    }
}
exports.Syncer = Syncer;
//# sourceMappingURL=Syncer.js.map