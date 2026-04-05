export type SimulationMode = 'working' | 'staged' | 'head' | 'base';
export interface BreakageSimulationOptions {
    mode?: SimulationMode;
    baseRef?: string;
    maxImpacted?: number;
    maxDepth?: number;
}
export interface ChangedFileStat {
    path: string;
    changeType: 'add' | 'delete' | 'modify' | 'rename';
    added: number;
    removed: number;
}
export interface ImpactedFile {
    path: string;
    distance: number;
}
export interface RegressionPrediction {
    id: string;
    title: string;
    severity: 'low' | 'medium' | 'high';
    confidence: number;
    reason: string;
    evidence: string[];
}
export interface BreakageSimulationReport {
    generatedAt: string;
    mode: SimulationMode;
    baseRef?: string;
    repository: {
        root: string;
        branch: string;
        headSha: string;
    };
    summary: {
        changedFiles: number;
        linesAdded: number;
        linesRemoved: number;
        impactedFiles: number;
        predictedRegressions: number;
    };
    changed: ChangedFileStat[];
    impacted: ImpactedFile[];
    regressions: RegressionPrediction[];
    recommendations: string[];
    coverage: {
        usedPersistedAssetMap: boolean;
        scannedFiles: number;
        dependencyEdges: number;
    };
}
export declare function runBreakageSimulation(cwd: string, options?: BreakageSimulationOptions): Promise<BreakageSimulationReport>;
//# sourceMappingURL=breakage-simulator.d.ts.map