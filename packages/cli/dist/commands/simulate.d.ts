export interface SimulateOptions {
    staged?: boolean;
    head?: boolean;
    base?: string;
    json?: boolean;
    maxImpacted?: number;
    depth?: number;
}
export declare function simulateCommand(options?: SimulateOptions): Promise<void>;
//# sourceMappingURL=simulate.d.ts.map