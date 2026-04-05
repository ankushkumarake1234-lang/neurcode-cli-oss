export type PlanSloIntentMode = 'implementation' | 'analysis';
export type PlanSloCoverageLevel = 'high' | 'medium' | 'low';
export type PlanSloCoverageStatus = 'sufficient' | 'warning' | 'insufficient';
export type PlanSloEscalationPolicyReason = 'enabled' | 'env_disabled' | 'canary_excluded' | 'kill_switch_cooldown';
export interface PlanSloEvent {
    schemaVersion: 1;
    timestamp: string;
    intentMode: PlanSloIntentMode;
    cached: boolean;
    success: boolean;
    exitCode: number;
    elapsedMs: number;
    rssKb: number;
    coverageScore: number | null;
    coverageLevel: PlanSloCoverageLevel | null;
    coverageStatus: PlanSloCoverageStatus | null;
    adaptiveEscalationTriggered: boolean;
    adaptiveEscalationReason: string | null;
    adaptiveEscalationDeepenedFiles: number;
    escalationPolicyEnabled: boolean | null;
    escalationPolicyReason: PlanSloEscalationPolicyReason | null;
    escalationCanaryPercent: number | null;
    escalationCanaryBucket: number | null;
    escalationKillSwitchTripped: boolean;
    escalationKillSwitchCooldownUntil: string | null;
    fileTreeCount: number | null;
    filesUsedForGeneration: number | null;
}
export interface PlanSloEventInput {
    timestamp?: string;
    intentMode: PlanSloIntentMode;
    cached: boolean;
    success: boolean;
    exitCode: number;
    elapsedMs: number;
    rssKb: number;
    coverageScore?: number | null;
    coverageLevel?: PlanSloCoverageLevel | null;
    coverageStatus?: PlanSloCoverageStatus | null;
    adaptiveEscalationTriggered?: boolean;
    adaptiveEscalationReason?: string | null;
    adaptiveEscalationDeepenedFiles?: number;
    escalationPolicyEnabled?: boolean | null;
    escalationPolicyReason?: PlanSloEscalationPolicyReason | null;
    escalationCanaryPercent?: number | null;
    escalationCanaryBucket?: number | null;
    escalationKillSwitchTripped?: boolean;
    escalationKillSwitchCooldownUntil?: string | null;
    fileTreeCount?: number | null;
    filesUsedForGeneration?: number | null;
}
export interface PlanEscalationGuardState {
    version: 1;
    updatedAt: string;
    consecutiveBreaches: number;
    lastBreachAt?: string;
    lastReason?: string;
    cooldownUntil?: string;
}
export interface PlanEscalationGuardSnapshot {
    path: string;
    present: boolean;
    cooldownActive: boolean;
    cooldownUntil: string | null;
    state: PlanEscalationGuardState | null;
}
export declare function getPlanSloLogPath(projectRoot: string): string;
export declare function getPlanEscalationGuardPath(projectRoot: string): string;
export declare function prunePlanSloLog(projectRoot: string, nowMs?: number): void;
export declare function appendPlanSloEvent(projectRoot: string, input: PlanSloEventInput): PlanSloEvent;
export declare function readPlanSloEvents(projectRoot: string): PlanSloEvent[];
export declare function readPlanEscalationGuardSnapshot(projectRoot: string, nowMs?: number): PlanEscalationGuardSnapshot;
//# sourceMappingURL=plan-slo.d.ts.map