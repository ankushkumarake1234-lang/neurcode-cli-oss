/**
 * Prompt command: Generate Cursor prompt from a plan
 * If planId is not provided, uses the last plan ID from state
 */
interface PromptOptions {
    json?: boolean;
    output?: string;
    copy?: boolean;
}
export declare function promptCommand(planId?: string, options?: PromptOptions): Promise<void>;
export {};
//# sourceMappingURL=prompt.d.ts.map