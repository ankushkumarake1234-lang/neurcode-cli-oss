export interface PolicyExceptionApproval {
    approver: string;
    approvedAt: string;
    comment: string | null;
}
export interface PolicyExceptionEntry {
    id: string;
    rulePattern: string;
    filePattern: string;
    reason: string;
    ticket: string | null;
    createdAt: string;
    createdBy: string;
    requestedBy: string;
    expiresAt: string;
    severity: 'allow' | 'warn' | 'block' | null;
    active: boolean;
    approvals: PolicyExceptionApproval[];
}
export interface PolicyExceptionEligibility {
    usable: boolean;
    reason: 'eligible' | 'expired_or_inactive' | 'reason_required' | 'duration_exceeds_max' | 'approval_required' | 'critical_approvals_required' | 'insufficient_approvals' | 'self_approval_only' | 'approver_not_allowed';
    effectiveApprovalCount: number;
    requiredApprovals: number;
    critical: boolean;
}
export interface PolicyExceptionApplyOptions {
    requireApproval: boolean;
    minApprovals: number;
    disallowSelfApproval: boolean;
    allowedApprovers: string[];
    requireReason: boolean;
    minReasonLength: number;
    maxExpiryDays: number;
    criticalRulePatterns: string[];
    criticalMinApprovals: number;
}
export interface PolicyExceptionDecision {
    remainingViolations: Array<{
        file: string;
        rule: string;
        severity: string;
        message?: string;
        line?: number;
    }>;
    suppressedViolations: Array<{
        file: string;
        rule: string;
        severity: string;
        message?: string;
        line?: number;
        exceptionId: string;
        reason: string;
        expiresAt: string;
    }>;
    blockedViolations: Array<{
        file: string;
        rule: string;
        severity: string;
        message?: string;
        line?: number;
        exceptionId: string;
        eligibilityReason: Exclude<PolicyExceptionEligibility['reason'], 'eligible'>;
        requiredApprovals: number;
        effectiveApprovals: number;
        critical: boolean;
    }>;
    matchedExceptionIds: string[];
    activeExceptions: PolicyExceptionEntry[];
    usableExceptions: PolicyExceptionEntry[];
}
export declare function getPolicyExceptionsPath(cwd: string): string;
export declare function readPolicyExceptions(cwd: string): PolicyExceptionEntry[];
export declare function writePolicyExceptions(cwd: string, entries: PolicyExceptionEntry[]): string;
export declare function listPolicyExceptions(cwd: string): {
    all: PolicyExceptionEntry[];
    active: PolicyExceptionEntry[];
    expired: PolicyExceptionEntry[];
};
export declare function addPolicyException(cwd: string, input: {
    rulePattern: string;
    filePattern: string;
    reason: string;
    ticket?: string;
    expiresAt: string;
    severity?: 'allow' | 'warn' | 'block';
    createdBy?: string;
    requestedBy?: string;
}): PolicyExceptionEntry;
export declare function approvePolicyException(cwd: string, id: string, input: {
    approver: string;
    comment?: string;
}): PolicyExceptionEntry | null;
export declare function revokePolicyException(cwd: string, id: string): boolean;
export declare function pruneExpiredPolicyExceptions(cwd: string): {
    removed: number;
    remaining: number;
};
export declare function applyPolicyExceptions(violations: Array<{
    file: string;
    rule: string;
    severity: string;
    message?: string;
    line?: number;
}>, exceptions: PolicyExceptionEntry[], options?: Partial<PolicyExceptionApplyOptions>): PolicyExceptionDecision;
//# sourceMappingURL=policy-exceptions.d.ts.map