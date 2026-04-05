import { DiffFile } from '@neurcode-ai/diff-parser';
import { AiChangeJustification, AiChangeLogIntegrityStatus, BlastRadiusReport, ChangeSet, ContextPolicy, ContextPolicyEvaluation, GovernanceDecisionReport, GovernancePlanSpec, OrgGovernanceSettings, SuspiciousChangeReport } from '@neurcode-ai/core';
export interface GovernanceEvaluationInput {
    projectRoot: string;
    task: string;
    expectedFiles: string[];
    expectedDependencies?: string[];
    diffFiles: DiffFile[];
    contextCandidates?: string[];
    orgGovernance?: OrgGovernanceSettings | null;
    signingKey?: string | null;
    signingKeyId?: string | null;
    signingKeys?: Record<string, string> | null;
    signer?: string;
}
export interface GovernanceEvaluationResult {
    planSpec: GovernancePlanSpec;
    changeSet: ChangeSet;
    effectiveContextPolicy: ContextPolicy;
    policySources: {
        localPolicy: boolean;
        orgPolicy: boolean;
        mode: 'local' | 'merged' | 'org_only';
    };
    contextPolicy: ContextPolicyEvaluation;
    changeJustification: AiChangeJustification;
    blastRadius: BlastRadiusReport;
    suspiciousChange: SuspiciousChangeReport;
    governanceDecision: GovernanceDecisionReport;
    aiChangeLogPath: string;
    aiChangeLogAuditPath: string;
    aiChangeLogIntegrity: AiChangeLogIntegrityStatus;
}
export declare function evaluateGovernance(input: GovernanceEvaluationInput): GovernanceEvaluationResult;
//# sourceMappingURL=governance.d.ts.map