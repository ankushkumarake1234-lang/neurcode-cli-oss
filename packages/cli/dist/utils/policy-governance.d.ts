export interface PolicyGovernanceConfig {
    schemaVersion: 1 | 2;
    exceptionApprovals: {
        required: boolean;
        minApprovals: number;
        disallowSelfApproval: boolean;
        allowedApprovers: string[];
        requireReason: boolean;
        minReasonLength: number;
        maxExpiryDays: number;
        criticalRulePatterns: string[];
        criticalMinApprovals: number;
    };
    audit: {
        requireIntegrity: boolean;
    };
}
export interface PolicyGovernanceOrgOverride {
    schemaVersion?: number;
    exceptionApprovals?: Partial<PolicyGovernanceConfig['exceptionApprovals']>;
    audit?: Partial<PolicyGovernanceConfig['audit']>;
}
export declare function isCriticalRuleMatch(rule: string, criticalRulePatterns: string[]): boolean;
export declare function resolveRequiredApprovalsForRule(rule: string, config: PolicyGovernanceConfig): {
    requiredApprovals: number;
    critical: boolean;
};
export declare function defaultPolicyGovernanceConfig(): PolicyGovernanceConfig;
export declare function getPolicyGovernancePath(cwd: string): string;
export declare function readPolicyGovernanceConfig(cwd: string): PolicyGovernanceConfig;
export declare function writePolicyGovernanceConfig(cwd: string, config: PolicyGovernanceConfig): string;
export declare function mergePolicyGovernanceWithOrgOverrides(localConfig: PolicyGovernanceConfig, orgOverride?: PolicyGovernanceOrgOverride | null): PolicyGovernanceConfig;
export declare function updatePolicyGovernanceConfig(cwd: string, input: Partial<{
    required: boolean;
    minApprovals: number;
    disallowSelfApproval: boolean;
    allowedApprovers: string[];
    requireReason: boolean;
    minReasonLength: number;
    maxExpiryDays: number;
    criticalRulePatterns: string[];
    criticalMinApprovals: number;
    requireAuditIntegrity: boolean;
}>): PolicyGovernanceConfig;
//# sourceMappingURL=policy-governance.d.ts.map