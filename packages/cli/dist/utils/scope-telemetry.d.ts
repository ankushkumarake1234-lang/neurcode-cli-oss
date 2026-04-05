import { type ProjectRootResolutionTrace } from './project-root';
export interface ScopeTelemetryPayload {
    scanRoot: string;
    startDir: string;
    gitRoot: string | null;
    linkedRepoOverrideUsed: boolean;
    linkedRepos: Array<{
        alias: string;
        path: string;
    }>;
    blockedOverride: null | {
        requested: string | null;
        resolved: string | null;
        reason: string;
    };
}
export declare function buildScopeTelemetryPayload(trace: ProjectRootResolutionTrace): ScopeTelemetryPayload;
export declare function printScopeTelemetry(chalk: any, scope: ScopeTelemetryPayload, options?: {
    includeBlockedWarning?: boolean;
}): void;
//# sourceMappingURL=scope-telemetry.d.ts.map