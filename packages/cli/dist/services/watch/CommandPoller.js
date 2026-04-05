"use strict";
/**
 * CommandPoller - Polls for remote commands and executes them locally
 *
 * Polls the cloud API every 3 seconds for pending commands (like file reverts).
 * When a command is received, executes it locally and updates the status.
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
exports.CommandPoller = void 0;
const config_1 = require("../../config");
const restore_1 = require("../../utils/restore");
const state_1 = require("../../utils/state");
const BlobStore_1 = require("./BlobStore");
const path = __importStar(require("path"));
const fs_1 = require("fs");
const crypto_1 = require("crypto");
/**
 * CommandPoller - Handles polling and execution of remote commands
 */
class CommandPoller {
    apiUrl;
    apiKey;
    projectRoot;
    pollInterval = null;
    pollIntervalMs = 3000; // Poll every 3 seconds
    isRunning = false;
    blobStore;
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        const config = (0, config_1.loadConfig)();
        this.apiUrl = config.apiUrl || config_1.DEFAULT_API_URL;
        this.apiKey = (0, config_1.getApiKey)();
        this.blobStore = new BlobStore_1.BlobStore(projectRoot);
    }
    /**
     * Start polling for commands
     */
    start() {
        if (this.isRunning) {
            console.warn('⚠️  CommandPoller is already running');
            return;
        }
        // If no API key, skip silently (local-only mode)
        if (!this.apiKey) {
            console.log('📦 Command polling: DISABLED (no API key configured)');
            return;
        }
        this.isRunning = true;
        console.log('🔄 Command polling: ENABLED (checking every 3s)');
        // Start polling immediately, then every 3 seconds
        this.poll();
        this.pollInterval = setInterval(() => {
            this.poll();
        }, this.pollIntervalMs);
    }
    /**
     * Stop polling for commands
     */
    stop() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        this.isRunning = false;
        console.log('🛑 Command polling stopped');
    }
    /**
     * Poll for pending commands and execute them
     */
    async poll() {
        if (!this.apiKey) {
            return;
        }
        try {
            const orgId = (0, state_1.getOrgId)();
            // Poll for pending commands
            const response = await fetch(`${this.apiUrl}/api/v1/commands/poll`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    ...(orgId ? { 'x-org-id': orgId } : {}),
                },
            });
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    // API key invalid, stop polling
                    console.warn('⚠️  Command polling: API key invalid, stopping');
                    this.stop();
                    return;
                }
                // For other errors, log but continue polling
                console.warn(`⚠️  Command poll failed: ${response.status}`);
                return;
            }
            const data = await response.json();
            if (!data.command) {
                // No pending commands - log occasionally for debugging (every 20 polls = ~1 minute)
                if (Math.random() < 0.05) {
                    console.log('🔄 Polling for commands... (no pending commands)');
                }
                return;
            }
            // Execute the command
            console.log(`📥 Found pending command: ${data.command.type} (${data.command.id.substring(0, 8)}...)`);
            await this.executeCommand(data.command);
        }
        catch (error) {
            // Log error but continue polling (network issues, etc.)
            console.warn(`⚠️  Command poll error: ${error.message}`);
        }
    }
    /**
     * Execute a command locally
     */
    async executeCommand(command) {
        console.log(`📥 Received command: ${command.type} (${command.id.substring(0, 8)}...)`);
        try {
            if (command.type === 'FILE_REVERT') {
                await this.executeFileRevert(command);
            }
            else {
                throw new Error(`Unknown command type: ${command.type}`);
            }
        }
        catch (error) {
            console.error(`❌ Command execution failed: ${error.message}`);
            await this.updateCommandStatus(command.id, 'FAILED', error.message);
        }
    }
    /**
     * Compute the hash of the current file content
     */
    async computeCurrentFileHash(filePath) {
        const resolvedPath = path.resolve(this.projectRoot, filePath);
        try {
            // Check if file exists
            await fs_1.promises.access(resolvedPath);
            // Read file content
            const content = await fs_1.promises.readFile(resolvedPath, 'utf-8');
            // Compute SHA-256 hash (same as BlobStore)
            const hash = (0, crypto_1.createHash)('sha256').update(content, 'utf8').digest('hex');
            return hash;
        }
        catch {
            // File doesn't exist
            return null;
        }
    }
    /**
     * Execute a FILE_REVERT command
     */
    async executeFileRevert(command) {
        const { filePath, blobHash } = command.payload;
        if (!filePath || !blobHash) {
            throw new Error('Missing filePath or blobHash in command payload');
        }
        // Check if blob exists locally
        const blobExists = await this.blobStore.exists(blobHash);
        if (!blobExists) {
            // Blob doesn't exist locally, fetch it from cloud
            console.log(`📥 Blob not found locally, fetching from cloud: ${blobHash.substring(0, 12)}...`);
            await this.fetchBlobFromCloud(blobHash);
        }
        // CRITICAL: Compare target hash with current file hash before reverting
        const currentHash = await this.computeCurrentFileHash(filePath);
        if (currentHash === blobHash) {
            console.log(`⚠️  Skipped revert: Target hash (${blobHash.substring(0, 8)}...) is identical to current file`);
            console.log(`   File ${filePath} is already at the requested version`);
            // Mark as completed (no-op, but successful)
            await this.updateCommandStatus(command.id, 'COMPLETED');
            return;
        }
        // Restore the file using existing restoreFile utility
        // Note: restoreFile expects hash and targetPath, and handles decompression
        await (0, restore_1.restoreFile)(blobHash, filePath, this.projectRoot);
        console.log(`✅ File reverted: ${filePath} (${blobHash.substring(0, 8)}...)`);
        if (currentHash) {
            console.log(`   Previous: ${currentHash.substring(0, 8)}... → New: ${blobHash.substring(0, 8)}...`);
        }
        // Update command status to COMPLETED
        await this.updateCommandStatus(command.id, 'COMPLETED');
    }
    /**
     * Fetch blob content from cloud API and store it locally
     */
    async fetchBlobFromCloud(hash) {
        if (!this.apiKey) {
            throw new Error('API key not found. Please run "neurcode login" first.');
        }
        try {
            const response = await fetch(`${this.apiUrl}/api/v1/blobs/${hash}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error(`Blob not found in cloud storage: ${hash.substring(0, 12)}...`);
                }
                if (response.status === 401 || response.status === 403) {
                    throw new Error('API key invalid. Please run "neurcode login" again.');
                }
                throw new Error(`Failed to fetch blob: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            // Decode base64 content to get GZIP compressed buffer
            const compressedContent = Buffer.from(data.content, 'base64');
            // Store the blob locally (BlobStore will handle the directory creation)
            await this.blobStore.initialize();
            const blobPath = this.blobStore.getBlobPath(hash);
            await fs_1.promises.writeFile(blobPath, compressedContent);
            console.log(`✅ Blob fetched and stored locally: ${hash.substring(0, 12)}...`);
        }
        catch (error) {
            throw new Error(`Failed to fetch blob from cloud: ${error.message}`);
        }
    }
    /**
     * Update command status on the server
     */
    async updateCommandStatus(commandId, status, errorMessage) {
        if (!this.apiKey) {
            return;
        }
        try {
            const orgId = (0, state_1.getOrgId)();
            const response = await fetch(`${this.apiUrl}/api/v1/commands/${commandId}/status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    ...(orgId ? { 'x-org-id': orgId } : {}),
                },
                body: JSON.stringify({
                    status,
                    errorMessage,
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.warn(`⚠️  Failed to update command status: ${response.status} ${errorText}`);
            }
        }
        catch (error) {
            console.warn(`⚠️  Failed to update command status: ${error.message}`);
        }
    }
    /**
     * Check if poller is configured (has API key)
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
        // Restart polling if we now have an API key and weren't running before
        if (this.apiKey && !this.isRunning) {
            this.start();
        }
    }
}
exports.CommandPoller = CommandPoller;
//# sourceMappingURL=CommandPoller.js.map