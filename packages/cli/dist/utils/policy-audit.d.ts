export type PolicyAuditAction = 'exception_added' | 'exception_approved' | 'exception_revoked' | 'exception_pruned' | 'governance_updated' | 'policy_lock_written' | 'policy_compiled';
export interface PolicyAuditEvent {
    schemaVersion: 1;
    timestamp: string;
    actor: string;
    action: PolicyAuditAction;
    entityType: 'policy_exception' | 'policy_governance' | 'policy_lock' | 'policy_compiled_artifact';
    entityId: string | null;
    metadata: Record<string, unknown>;
    prevHash: string | null;
    hash: string;
}
export interface PolicyAuditVerification {
    valid: boolean;
    count: number;
    lastHash: string | null;
    issues: string[];
}
export declare function getPolicyAuditPath(cwd: string): string;
export declare function readPolicyAuditEvents(cwd: string): PolicyAuditEvent[];
export declare function appendPolicyAuditEvent(cwd: string, input: {
    actor: string;
    action: PolicyAuditAction;
    entityType: PolicyAuditEvent['entityType'];
    entityId?: string | null;
    metadata?: Record<string, unknown>;
}): PolicyAuditEvent;
export declare function verifyPolicyAuditIntegrity(cwd: string): PolicyAuditVerification;
//# sourceMappingURL=policy-audit.d.ts.map