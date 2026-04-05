import type { GeneratePlanResponse } from '../api-client';
export type RepoFingerprint = {
    kind: 'git';
    repoIdentity: string;
    headSha: string;
    headTreeSha: string;
    workingTreeHash: string;
} | {
    kind: 'filesystem';
    repoIdentity: string;
    fileTreeHash: string;
};
export interface PlanCacheKeyInputV2 {
    schemaVersion: 2;
    orgId: string;
    projectId: string;
    repo: RepoFingerprint;
    promptHash: string;
    policyVersionHash: string;
    neurcodeVersion: string;
}
export interface CachedPlanInputV2 extends PlanCacheKeyInputV2 {
    intent: string;
    intentHash?: string;
    ticketRef?: string;
    contextHash?: string;
}
export interface CachedPlanEntryV1 {
    key: string;
    createdAt: string;
    lastUsedAt: string;
    useCount: number;
    input: CachedPlanInputV2;
    response: GeneratePlanResponse;
}
export interface NearCachedPlanLookupInput {
    orgId: string;
    projectId: string;
    repo: RepoFingerprint;
    intent: string;
    policyVersionHash: string;
    neurcodeVersion: string;
    ticketRef?: string;
    contextHash?: string;
    minIntentSimilarity?: number;
}
export interface NearCachedPlanResult {
    entry: CachedPlanEntryV1;
    intentSimilarity: number;
    reason: 'same_snapshot_similar_intent';
}
export interface PlanCacheMissDiagnostics {
    reason: 'no_scope_entries' | 'repo_identity_changed' | 'repo_snapshot_changed' | 'policy_changed' | 'neurcode_version_changed' | 'prompt_changed';
    scopedEntries: number;
    repoEntries: number;
    comparableSnapshotEntries: number;
    policyMatchedEntries: number;
    versionMatchedEntries: number;
    bestIntentSimilarity: number;
    bestIntent?: string;
}
export declare function normalizeIntent(intent: string): string;
export declare function getRepoIdentity(cwd: string): string;
export declare function getGitRepoFingerprint(cwd: string): RepoFingerprint | null;
export declare function getFilesystemFingerprintFromTree(fileTree: string[], cwd?: string): RepoFingerprint;
export declare function computePromptHash(input: {
    intent: string;
    ticketRef?: string;
    contextHash?: string;
}): string;
export declare function computePolicyVersionHash(cwd: string): string;
export declare function getNeurcodeVersion(): string;
export declare function computePlanCacheKey(input: PlanCacheKeyInputV2): string;
export declare function getBrainDbPath(cwd: string): string;
export declare function getBrainPointerPath(cwd: string): string;
export declare function getBrainFallbackCachePath(cwd: string): string;
export declare function getPlanCachePath(cwd: string): string;
export declare function getBrainStorageMode(cwd: string): {
    noCodeStorage: boolean;
    source: 'env' | 'pointer' | 'default';
};
export declare function setNoCodeStorageMode(cwd: string, enabled: boolean): void;
export declare function isNoCodeStorageMode(cwd: string): boolean;
export declare function readCachedPlan(cwd: string, key: string): CachedPlanEntryV1 | null;
export declare function peekCachedPlan(cwd: string, key: string): CachedPlanEntryV1 | null;
export declare function writeCachedPlan(cwd: string, entry: Omit<CachedPlanEntryV1, 'createdAt' | 'lastUsedAt' | 'useCount'>): void;
export declare function listCachedPlans(cwd: string): CachedPlanEntryV1[];
export declare function deleteCachedPlans(cwd: string, shouldDelete: (entry: CachedPlanEntryV1) => boolean): {
    deleted: number;
    remaining: number;
};
export declare function findSimilarCachedPlans(cwd: string, filter: {
    orgId: string;
    projectId: string;
    repoIdentity?: string;
}, intent: string, k?: number): CachedPlanEntryV1[];
export declare function findNearCachedPlan(cwd: string, input: NearCachedPlanLookupInput): NearCachedPlanResult | null;
export declare function diagnosePlanCacheMiss(cwd: string, input: {
    orgId: string;
    projectId: string;
    repo: RepoFingerprint;
    intent: string;
    policyVersionHash: string;
    neurcodeVersion: string;
}): PlanCacheMissDiagnostics;
export declare function getBrainDbSizeBytes(cwd: string): number | null;
export declare function getBrainStoreBackend(cwd: string): 'sqlite' | 'json-fallback';
export declare function closeBrainStore(cwd?: string): void;
//# sourceMappingURL=plan-cache.d.ts.map