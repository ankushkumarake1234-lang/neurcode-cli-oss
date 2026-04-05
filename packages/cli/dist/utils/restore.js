"use strict";
/**
 * Restore a file from a blob hash
 *
 * Reads a GZIP-compressed blob from .neurcode/blobs/<hash> and
 * writes it to the target file path.
 *
 * @param hash - SHA-256 hash of the file content
 * @param targetPath - Relative path to the file to restore (e.g., "src/components/Button.tsx")
 * @param projectRoot - Root directory of the project
 * @returns Promise that resolves when the file is restored
 * @throws Error if the blob doesn't exist, path is invalid, or write fails
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
exports.restoreFile = restoreFile;
const zlib_1 = require("zlib");
const fs_1 = require("fs");
const path = __importStar(require("path"));
const fsExtra = __importStar(require("fs-extra"));
async function restoreFile(hash, targetPath, projectRoot) {
    // Resolve the target file path relative to project root
    const resolvedTargetPath = path.resolve(projectRoot, targetPath);
    // Security: Ensure the target path is within the project root
    // This prevents path traversal attacks (e.g., ../../../etc/passwd)
    const resolvedProjectRoot = path.resolve(projectRoot);
    if (!resolvedTargetPath.startsWith(resolvedProjectRoot)) {
        throw new Error(`Invalid file path: ${targetPath} - Path traversal detected`);
    }
    // Resolve blob path
    const blobPath = path.join(projectRoot, '.neurcode', 'blobs', hash);
    // Check if blob exists
    try {
        await fs_1.promises.access(blobPath);
    }
    catch {
        throw new Error(`Blob not found: ${hash}`);
    }
    // Read the compressed blob
    const compressedData = await fs_1.promises.readFile(blobPath);
    // Decompress using GZIP
    let decompressedData;
    try {
        decompressedData = (0, zlib_1.gunzipSync)(compressedData);
    }
    catch (error) {
        throw new Error(`Failed to decompress blob: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    // Convert to string (assuming UTF-8 encoding)
    const fileContent = decompressedData.toString('utf-8');
    // Ensure the target directory exists
    const targetDir = path.dirname(resolvedTargetPath);
    await fsExtra.ensureDir(targetDir);
    // Write the file
    await fs_1.promises.writeFile(resolvedTargetPath, fileContent, 'utf-8');
}
//# sourceMappingURL=restore.js.map