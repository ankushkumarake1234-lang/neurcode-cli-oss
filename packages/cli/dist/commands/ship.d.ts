interface ShipOptions {
    projectId?: string;
    maxFixAttempts?: number;
    allowDirty?: boolean;
    skipTests?: boolean;
    testCommand?: string;
    record?: boolean;
    requirePass?: boolean;
    requirePolicyLock?: boolean;
    skipPolicyLock?: boolean;
    manualApproveHighRisk?: boolean;
    json?: boolean;
    publishCard?: boolean;
    resumeRunId?: string;
    resumeFromPlanId?: string;
    resumeInitialPlanId?: string;
    resumeRepairPlanIds?: string[];
    resumeRemediationAttempts?: number;
    resumeBaselineDirtyPaths?: string[];
    resumeStartedAtIso?: string;
}
export declare function shipCommand(goal: string, options: ShipOptions): Promise<void>;
interface ShipResumeOptions {
    projectId?: string;
    maxFixAttempts?: number;
    skipTests?: boolean;
    testCommand?: string;
    record?: boolean;
    requirePass?: boolean;
    requirePolicyLock?: boolean;
    skipPolicyLock?: boolean;
    manualApproveHighRisk?: boolean;
    publishCard?: boolean;
    json?: boolean;
}
export declare function shipResumeCommand(runId: string, options: ShipResumeOptions): Promise<void>;
export declare function shipRunsCommand(options: {
    json?: boolean;
    limit?: number;
}): void;
interface ShipAttestationVerifyOptions {
    json?: boolean;
    hmacKey?: string;
}
export declare function shipAttestationVerifyCommand(attestationPathInput: string, options: ShipAttestationVerifyOptions): void;
export {};
//# sourceMappingURL=ship.d.ts.map