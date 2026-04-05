interface PlanOptions {
    projectId?: string;
    ticket?: string;
    issue?: string;
    pr?: string;
    mask?: boolean;
    cache?: boolean;
    json?: boolean;
    snapshotMode?: 'auto' | 'full' | 'off';
    snapshotMaxFiles?: number;
    snapshotBudgetMs?: number;
}
export type IntentMode = 'implementation' | 'analysis';
export declare function detectIntentMode(intent: string): IntentMode;
export declare function planCommand(intent: string, options: PlanOptions): Promise<void>;
export {};
//# sourceMappingURL=plan.d.ts.map