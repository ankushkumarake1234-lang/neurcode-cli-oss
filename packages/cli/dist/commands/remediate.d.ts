interface RemediateOptions {
    goal?: string;
    planId?: string;
    projectId?: string;
    maxFixAttempts?: number;
    policyOnly?: boolean;
    requirePlan?: boolean;
    requirePolicyLock?: boolean;
    skipPolicyLock?: boolean;
    strictArtifacts?: boolean;
    enforceChangeContract?: boolean;
    requireRuntimeGuard?: boolean;
    autoRepairAiLog?: boolean;
    noRecord?: boolean;
    skipTests?: boolean;
    publishCard?: boolean;
    json?: boolean;
}
export declare function remediateCommand(options?: RemediateOptions): Promise<void>;
export {};
//# sourceMappingURL=remediate.d.ts.map