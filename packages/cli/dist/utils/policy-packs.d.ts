import { type Rule } from '@neurcode-ai/policy-engine';
import type { ActiveCustomPolicy } from './custom-policy-rules';
export type PolicyPackId = 'fintech' | 'hipaa' | 'soc2' | 'startup-fast' | 'node' | 'python' | 'java' | 'frontend';
export interface PolicyPackDefinition {
    id: PolicyPackId;
    name: string;
    description: string;
    version: string;
    tags: string[];
    rules: Rule[];
}
export interface InstalledPolicyPack {
    schemaVersion: 1;
    packId: PolicyPackId;
    packName: string;
    version: string;
    installedAt: string;
    tags: string[];
    rules: Rule[];
}
export interface PolicyLockCustomPolicyRef {
    id: string;
    severity: 'low' | 'medium' | 'high';
    updatedAt: string;
    ruleTextHash: string;
}
export interface PolicyStateSnapshot {
    schemaVersion: 1;
    generatedAt: string;
    defaultRules: {
        count: number;
        fingerprint: string;
    };
    policyPack: {
        id: PolicyPackId;
        name: string;
        version: string;
        ruleCount: number;
        fingerprint: string;
    } | null;
    customPolicies: {
        mode: 'dashboard' | 'disabled';
        count: number;
        fingerprint: string;
        mappedRuleCount: number;
        mappedRulesFingerprint: string;
        refs: PolicyLockCustomPolicyRef[];
    };
    effective: {
        ruleCount: number;
        fingerprint: string;
    };
}
export type PolicyLockFile = PolicyStateSnapshot;
export interface PolicyLockReadResult {
    path: string;
    exists: boolean;
    lock: PolicyLockFile | null;
    error?: string;
}
export interface PolicyLockMismatch {
    code: 'POLICY_LOCK_MISSING' | 'POLICY_LOCK_INVALID' | 'POLICY_LOCK_MODE_MISMATCH' | 'POLICY_LOCK_PACK_MISMATCH' | 'POLICY_LOCK_DEFAULT_RULES_MISMATCH' | 'POLICY_LOCK_CUSTOM_POLICIES_MISMATCH' | 'POLICY_LOCK_CUSTOM_RULES_MISMATCH' | 'POLICY_LOCK_EFFECTIVE_RULES_MISMATCH';
    message: string;
    expected?: string;
    actual?: string;
}
export interface PolicyLockValidationResult {
    lockPath: string;
    lockFileFound: boolean;
    lockPresent: boolean;
    enforced: boolean;
    matched: boolean;
    mismatches: PolicyLockMismatch[];
    lock: PolicyLockFile | null;
}
export declare function listPolicyPacks(): PolicyPackDefinition[];
export declare function getPolicyPack(packId: string): PolicyPackDefinition | null;
export declare function readInstalledPolicyPack(cwd: string): InstalledPolicyPack | null;
export declare function installPolicyPack(cwd: string, packId: string, force?: boolean): InstalledPolicyPack;
export declare function uninstallPolicyPack(cwd: string): boolean;
export declare function getInstalledPolicyPackRules(cwd: string): {
    packId: PolicyPackId;
    packName: string;
    version: string;
    rules: Rule[];
} | null;
export declare function getPolicyLockPath(cwd: string): string;
export declare function readPolicyLockFile(cwd: string): PolicyLockReadResult;
export declare function writePolicyLockFile(cwd: string, lock: PolicyLockFile): string;
export declare function buildPolicyStateSnapshot(input: {
    policyPack: ReturnType<typeof getInstalledPolicyPackRules>;
    policyPackRules: Rule[];
    customPolicies: ActiveCustomPolicy[];
    customRules: Rule[];
    includeDashboardPolicies: boolean;
    generatedAt?: string;
}): PolicyStateSnapshot;
export declare function comparePolicyStateToLock(lock: PolicyLockFile, current: PolicyStateSnapshot): PolicyLockMismatch[];
export declare function evaluatePolicyLock(cwd: string, current: PolicyStateSnapshot, options?: {
    requireLock?: boolean;
}): PolicyLockValidationResult;
//# sourceMappingURL=policy-packs.d.ts.map