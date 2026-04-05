"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateGovernance = evaluateGovernance;
const analysis_1 = require("@neurcode-ai/analysis");
const brain_1 = require("@neurcode-ai/brain");
const core_1 = require("@neurcode-ai/core");
const policy_1 = require("@neurcode-ai/policy");
function evaluateGovernance(input) {
    const normalizedExpectedFiles = input.expectedFiles.map((filePath) => (0, core_1.normalizeRepoPath)(filePath));
    const planSpec = (0, analysis_1.buildPlanSpec)(input.task, normalizedExpectedFiles, input.expectedDependencies || []);
    const changedFiles = input.diffFiles
        .map((file) => (0, core_1.normalizeRepoPath)(file.path))
        .filter(Boolean);
    const localPolicy = (0, policy_1.loadContextPolicy)(input.projectRoot);
    const orgPolicy = input.orgGovernance?.contextPolicy;
    const effectiveContextPolicy = orgPolicy
        ? (0, policy_1.mergeContextPolicies)(localPolicy, orgPolicy)
        : localPolicy;
    const policySources = {
        localPolicy: true,
        orgPolicy: Boolean(orgPolicy),
        mode: orgPolicy ? 'merged' : 'local',
    };
    const contextPolicy = (0, policy_1.evaluateContextPolicyForChanges)(changedFiles, effectiveContextPolicy, input.contextCandidates || []);
    const brainMap = (0, brain_1.buildBrainRepositoryMap)(input.projectRoot, {
        changedFiles,
        persist: true,
    });
    const analysis = (0, analysis_1.summarizeGovernance)(input.task, input.diffFiles, brainMap, planSpec);
    const governanceDecision = (0, analysis_1.evaluateGovernanceDecision)(analysis.changeJustification, analysis.blastRadius, analysis.suspiciousChange, contextPolicy);
    const writtenChangeLog = (0, analysis_1.writeAiChangeLogWithIntegrity)(input.projectRoot, analysis.changeJustification, {
        signingKey: input.signingKey,
        keyId: input.signingKeyId,
        signer: input.signer,
    });
    let aiChangeLogIntegrity = writtenChangeLog.integrity;
    let governanceDecisionFinal = governanceDecision;
    const requireSignedAiLogs = input.orgGovernance?.requireSignedAiLogs === true;
    if (requireSignedAiLogs) {
        aiChangeLogIntegrity = (0, analysis_1.verifyAiChangeLogIntegrity)(input.projectRoot, {
            requiredSigned: true,
            signingKey: input.signingKey,
            signingKeys: input.signingKeys || undefined,
        });
    }
    if (requireSignedAiLogs && !aiChangeLogIntegrity.valid) {
        governanceDecisionFinal = {
            ...governanceDecisionFinal,
            decision: 'block',
            reasonCodes: [...new Set([...governanceDecisionFinal.reasonCodes, 'ai_change_log_integrity'])],
            summary: 'Block change set until signed AI change-log integrity is valid',
            requiresManualApproval: false,
        };
    }
    return {
        planSpec,
        changeSet: analysis.changeSet,
        effectiveContextPolicy,
        policySources,
        contextPolicy,
        changeJustification: analysis.changeJustification,
        blastRadius: analysis.blastRadius,
        suspiciousChange: analysis.suspiciousChange,
        governanceDecision: governanceDecisionFinal,
        aiChangeLogPath: writtenChangeLog.path,
        aiChangeLogAuditPath: writtenChangeLog.auditPath,
        aiChangeLogIntegrity,
    };
}
//# sourceMappingURL=governance.js.map