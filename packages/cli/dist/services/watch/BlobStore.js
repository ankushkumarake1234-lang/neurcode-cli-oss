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
exports.BlobStore = void 0;
const crypto_1 = require("crypto");
const zlib_1 = require("zlib");
const fs_1 = require("fs");
const path = __importStar(require("path"));
const fsExtra = __importStar(require("fs-extra"));
/**
 * BlobStore - Content-Addressable Storage for file content
 *
 * Stores compressed file content in .neurcode/blobs/ directory.
 * Filename is the SHA-256 hash of the content.
 */
class BlobStore {
    blobsDir;
    constructor(projectRoot) {
        this.blobsDir = path.join(projectRoot, '.neurcode', 'blobs');
    }
    /**
     * Initialize the blob store directory
     */
    async initialize() {
        await fsExtra.ensureDir(this.blobsDir);
    }
    /**
     * Store content and return its hash
     * @param content - The file content to store
     * @returns The SHA-256 hash of the content
     */
    async store(content) {
        // Compute SHA-256 hash
        const hash = (0, crypto_1.createHash)('sha256').update(content, 'utf8').digest('hex');
        const blobPath = path.join(this.blobsDir, hash);
        // Check if blob already exists
        try {
            await fs_1.promises.access(blobPath);
            // Blob already exists, return hash
            return hash;
        }
        catch {
            // Blob doesn't exist, create it
        }
        // Compress content with GZIP
        const compressed = (0, zlib_1.gzipSync)(Buffer.from(content, 'utf8'));
        // Write compressed content to disk
        await fs_1.promises.writeFile(blobPath, compressed);
        return hash;
    }
    /**
     * Check if a blob exists by hash
     * @param hash - The SHA-256 hash
     * @returns True if the blob exists
     */
    async exists(hash) {
        const blobPath = path.join(this.blobsDir, hash);
        try {
            await fs_1.promises.access(blobPath);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Get the path to a blob by hash
     * @param hash - The SHA-256 hash
     * @returns The full path to the blob file
     */
    getBlobPath(hash) {
        return path.join(this.blobsDir, hash);
    }
}
exports.BlobStore = BlobStore;
//# sourceMappingURL=BlobStore.js.map