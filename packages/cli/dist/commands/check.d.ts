interface CheckOptions {
    staged?: boolean;
    head?: boolean;
    base?: string;
    online?: boolean;
    ai?: boolean;
    intent?: string;
    sessionId?: string;
}
export declare function checkCommand(options: CheckOptions): Promise<void>;
export {};
//# sourceMappingURL=check.d.ts.map