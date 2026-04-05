import type { GovernanceArtifactSignature } from './artifact-signature';
export interface ChangeContract {
    schemaVersion: 1;
    generatedAt: string;
    contractId: string;
    signature?: GovernanceArtifactSignature;
    planId: string;
    sessionId: string | null;
    projectId: string | null;
    intentHash: string;
    expectedFiles: string[];
    expectedFilesFingerprint: string;
    policyLockFingerprint: string | null;
    compiledPolicyFingerprint: string | null;
}
export interface ReadChangeContractResult {
    path: string;
    exists: boolean;
    contract: ChangeContract | null;
    error?: string;
}
export interface ChangeContractViolation {
    code: 'CHANGE_CONTRACT_PLAN_MISMATCH' | 'CHANGE_CONTRACT_UNEXPECTED_FILE' | 'CHANGE_CONTRACT_POLICY_LOCK_MISMATCH' | 'CHANGE_CONTRACT_COMPILED_POLICY_MISMATCH';
    message: string;
    file?: string;
    expected?: string;
    actual?: string;
}
export interface ChangeContractEvaluation {
    valid: boolean;
    violations: ChangeContractViolation[];
    coverage: {
        expectedFiles: number;
        changedFiles: number;
        outOfContractFiles: number;
    };
}
export declare function createChangeContract(input: {
    generatedAt?: string;
    planId: string;
    sessionId?: string | null;
    projectId?: string | null;
    intent: string;
    expectedFiles: string[];
    policyLockFingerprint?: string | null;
    compiledPolicyFingerprint?: string | null;
}): ChangeContract;
export declare function resolveChangeContractPath(projectRoot: string, inputPath?: string): string;
export declare function writeChangeContract(projectRoot: string, contract: ChangeContract, outputPath?: string): string;
export declare function readChangeContract(projectRoot: string, inputPath?: string): ReadChangeContractResult;
export declare function evaluateChangeContract(contract: ChangeContract, input: {
    planId: string;
    changedFiles: string[];
    policyLockFingerprint?: string | null;
    compiledPolicyFingerprint?: string | null;
}): ChangeContractEvaluation;
//# sourceMappingURL=change-contract.d.ts.map