"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildScopeTelemetryPayload = buildScopeTelemetryPayload;
exports.printScopeTelemetry = printScopeTelemetry;
function buildScopeTelemetryPayload(trace) {
    return {
        scanRoot: trace.projectRoot,
        startDir: trace.startDir,
        gitRoot: trace.gitRoot,
        linkedRepoOverrideUsed: trace.linkedRepoOverrideUsed,
        linkedRepos: trace.linkedRepos.map((link) => ({
            alias: link.alias,
            path: link.path,
        })),
        blockedOverride: trace.overrideStatus === 'blocked_cross_repo' || trace.overrideStatus === 'blocked_home_guard'
            ? {
                requested: trace.overrideRequested,
                resolved: trace.overrideResolved,
                reason: trace.overrideBlockedReason || trace.overrideStatus,
            }
            : null,
    };
}
function printScopeTelemetry(chalk, scope, options) {
    const linkedRepoSummary = scope.linkedRepos.length > 0
        ? scope.linkedRepos.map((link) => link.alias).join(', ')
        : 'none';
    const overrideLabel = scope.linkedRepoOverrideUsed ? ' (linked override)' : '';
    console.log(chalk.dim(`🔐 Scope root: ${scope.scanRoot}${overrideLabel} | linked repos: ${linkedRepoSummary}`));
    if (options?.includeBlockedWarning && scope.blockedOverride) {
        const requested = scope.blockedOverride.requested || 'unknown';
        console.log(chalk.yellow(`⚠️  Scope override blocked: ${requested} (${scope.blockedOverride.reason})`));
    }
}
//# sourceMappingURL=scope-telemetry.js.map