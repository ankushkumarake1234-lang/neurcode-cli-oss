/**
 * BlobStore - Content-Addressable Storage for file content
 *
 * Stores compressed file content in .neurcode/blobs/ directory.
 * Filename is the SHA-256 hash of the content.
 */
export declare class BlobStore {
    private readonly blobsDir;
    constructor(projectRoot: string);
    /**
     * Initialize the blob store directory
     */
    initialize(): Promise<void>;
    /**
     * Store content and return its hash
     * @param content - The file content to store
     * @returns The SHA-256 hash of the content
     */
    store(content: string): Promise<string>;
    /**
     * Check if a blob exists by hash
     * @param hash - The SHA-256 hash
     * @returns True if the blob exists
     */
    exists(hash: string): Promise<boolean>;
    /**
     * Get the path to a blob by hash
     * @param hash - The SHA-256 hash
     * @returns The full path to the blob file
     */
    getBlobPath(hash: string): string;
}
//# sourceMappingURL=BlobStore.d.ts.map