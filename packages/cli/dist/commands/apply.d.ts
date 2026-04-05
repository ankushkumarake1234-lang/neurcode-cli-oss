interface ApplyOptions {
    force?: boolean;
    json?: boolean;
}
/**
 * Apply a saved architect plan by generating and writing code files
 */
export declare function applyCommand(planId: string, options: ApplyOptions): Promise<void>;
export {};
//# sourceMappingURL=apply.d.ts.map