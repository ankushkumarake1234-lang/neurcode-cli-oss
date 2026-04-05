export type BrainEventType = 'watch_change' | 'watch_delete' | 'apply' | 'verify' | 'plan' | 'refresh' | 'ask';
export interface BrainScopeInput {
    orgId: string | null;
    projectId: string | null;
}
export interface BrainProgressEventInput {
    type: BrainEventType;
    filePath?: string;
    planId?: string;
    verdict?: string;
    note?: string;
}
export interface BrainFileContextEntry {
    path: string;
    contentHash: string;
    language: string;
    symbols: string[];
    summary: string;
    sizeBytes: number;
    updatedAt: string;
    lastSeenAt: string;
}
export interface BrainContextPackResult {
    text: string;
    selectedFiles: number;
    recentEvents: number;
    totalIndexedFiles: number;
}
export interface BrainContextSearchEntry {
    path: string;
    summary: string;
    language: string;
    symbols: string[];
    contentHash: string;
    updatedAt: string;
    lastSeenAt: string;
    score: number;
}
export interface BrainContextSearchResult {
    entries: BrainContextSearchEntry[];
    totalIndexedFiles: number;
    lastUpdatedAt?: string;
    lastRefreshAt?: string;
}
export interface BrainContextStats {
    path: string;
    exists: boolean;
    scopeFound: boolean;
    totalScopes: number;
    fileEntries: number;
    eventEntries: number;
    lastUpdatedAt?: string;
    lastRefreshAt?: string;
    lastWorkingTreeHash?: string;
}
export declare function getBrainContextPath(cwd: string): string;
export declare function upsertBrainFileContextFromContent(cwd: string, scope: BrainScopeInput, filePath: string, content: string): {
    indexed: boolean;
    created: boolean;
    updated: boolean;
};
export declare function removeBrainFileContext(cwd: string, scope: BrainScopeInput, filePath: string): {
    removed: boolean;
};
export declare function refreshBrainContextForFiles(cwd: string, scope: BrainScopeInput, filePaths: string[]): {
    indexed: number;
    removed: number;
    skipped: number;
};
export declare function refreshBrainContextFromWorkspace(cwd: string, scope: BrainScopeInput, options?: {
    workingTreeHash?: string;
    maxFiles?: number;
    recordEvent?: boolean;
}): {
    indexed: number;
    removed: number;
    skipped: number;
    considered: number;
    refreshed: boolean;
};
export declare function recordBrainProgressEvent(cwd: string, scope: BrainScopeInput, event: BrainProgressEventInput): void;
export declare function buildBrainContextPack(cwd: string, scope: BrainScopeInput, intent: string, options?: {
    maxFiles?: number;
    maxEvents?: number;
    maxBytes?: number;
}): BrainContextPackResult;
export declare function searchBrainContextEntries(cwd: string, scope: BrainScopeInput, query: string, options?: {
    limit?: number;
}): BrainContextSearchResult;
export declare function getBrainContextStats(cwd: string, scope: BrainScopeInput): BrainContextStats;
export declare function clearBrainContext(cwd: string, mode: 'project' | 'org' | 'repo', scope: BrainScopeInput): {
    removedScopes: number;
    removedFiles: number;
    removedEvents: number;
    removedStoreFile: boolean;
};
//# sourceMappingURL=brain-context.d.ts.map