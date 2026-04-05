interface BootstrapOptions {
    pack?: string;
    forcePack?: boolean;
    intent?: string;
    requireDeterministicMatch?: boolean;
    includeDashboard?: boolean;
    requireDashboard?: boolean;
    provider?: string;
    planInput?: string;
    planText?: string;
    planStdin?: boolean;
    skipContract?: boolean;
    skipGuard?: boolean;
    strictGuard?: boolean;
    allowAdvisoryFallback?: boolean;
    json?: boolean;
}
export declare function bootstrapCommand(options?: BootstrapOptions): Promise<void>;
export {};
//# sourceMappingURL=bootstrap.d.ts.map