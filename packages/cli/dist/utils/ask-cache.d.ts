import type { RepoFingerprint } from './plan-cache';
export interface AskCitation {
    path: string;
    line: number;
    snippet: string;
    term?: string;
}
export interface AskAnswerPayload {
    question: string;
    questionNormalized: string;
    mode: 'comparison' | 'search';
    answer: string;
    findings: string[];
    confidence: 'high' | 'medium' | 'low';
    proof?: {
        topFiles: string[];
        evidenceCount: number;
        coverage: {
            sourceCitations: number;
            sourceFiles: number;
            matchedFiles: number;
            matchedLines: number;
        };
    };
    truth: {
        status: 'grounded' | 'insufficient';
        score: number;
        reasons: string[];
        sourceCitations: number;
        sourceFiles: number;
        minCitationsRequired: number;
        minFilesRequired: number;
    };
    citations: AskCitation[];
    generatedAt: string;
    stats: {
        scannedFiles: number;
        matchedFiles: number;
        matchedLines: number;
        brainCandidates: number;
    };
}
export interface AskCacheKeyInputV1 {
    schemaVersion: 3;
    orgId: string;
    projectId: string;
    repo: RepoFingerprint;
    questionHash: string;
    policyVersionHash: string;
    neurcodeVersion: string;
}
export interface CachedAskInputV1 extends AskCacheKeyInputV1 {
    question: string;
    contextHash?: string;
}
export interface CachedAskEntryV1 {
    key: string;
    createdAt: string;
    lastUsedAt: string;
    useCount: number;
    input: CachedAskInputV1;
    output: AskAnswerPayload;
    evidencePaths: string[];
}
export interface NearCachedAskLookupInput {
    orgId: string;
    projectId: string;
    repo: RepoFingerprint;
    question: string;
    policyVersionHash: string;
    neurcodeVersion: string;
    contextHash?: string;
    changedPaths?: string[];
    minSimilarity?: number;
}
export interface NearCachedAskResult {
    entry: CachedAskEntryV1;
    similarity: number;
    reason: 'same_snapshot_similar_question' | 'safe_repo_drift_similar_question';
}
export interface AskCacheDeleteResult {
    deleted: number;
    remaining: number;
}
export declare function getAskCachePath(cwd: string): string;
export declare function computeAskQuestionHash(input: {
    question: string;
    contextHash?: string;
}): string;
export declare function computeAskCacheKey(input: AskCacheKeyInputV1): string;
export declare function readCachedAsk(cwd: string, key: string): CachedAskEntryV1 | null;
export declare function writeCachedAsk(cwd: string, entry: Omit<CachedAskEntryV1, 'createdAt' | 'lastUsedAt' | 'useCount'>): void;
export declare function findNearCachedAsk(cwd: string, input: NearCachedAskLookupInput): NearCachedAskResult | null;
export declare function getChangedWorkingTreePaths(cwd: string, limit?: number): string[];
export declare function listCachedAsks(cwd: string): CachedAskEntryV1[];
export declare function deleteCachedAsks(cwd: string, predicate: (entry: CachedAskEntryV1) => boolean): AskCacheDeleteResult;
//# sourceMappingURL=ask-cache.d.ts.map