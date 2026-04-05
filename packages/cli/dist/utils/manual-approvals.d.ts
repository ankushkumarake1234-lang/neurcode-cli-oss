export interface ManualApprovalEntry {
    id: string;
    commitSha: string;
    planId: string | null;
    approver: string;
    reason: string | null;
    approvedAt: string;
}
export declare function getManualApprovalsPath(projectRoot: string): string;
export declare function readManualApprovals(projectRoot: string): ManualApprovalEntry[];
export declare function writeManualApprovals(projectRoot: string, approvals: ManualApprovalEntry[]): string;
export declare function addManualApproval(projectRoot: string, input: {
    commitSha: string;
    planId?: string | null;
    approver: string;
    reason?: string | null;
}): ManualApprovalEntry;
export declare function getManualApprovalsForCommit(projectRoot: string, commitSha: string): ManualApprovalEntry[];
export declare function countDistinctApprovers(entries: ManualApprovalEntry[]): number;
//# sourceMappingURL=manual-approvals.d.ts.map