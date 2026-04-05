interface AskOptions {
    projectId?: string;
    json?: boolean;
    cache?: boolean;
    maxCitations?: number;
    fromPlan?: boolean;
    verbose?: boolean;
    proof?: boolean;
}
export declare function askCommand(question: string, options?: AskOptions): Promise<void>;
export {};
//# sourceMappingURL=ask.d.ts.map