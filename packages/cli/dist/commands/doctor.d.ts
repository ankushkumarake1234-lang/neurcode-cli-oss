/**
 * Doctor Command - Enterprise Readiness Diagnostics
 *
 * Verifies:
 * - CLI configuration and auth
 * - Project/workspace wiring
 * - Deterministic governance artifacts
 * - API health + runtime compatibility handshake
 * - Notifications stream CORS preflight (dashboard critical path)
 */
interface DoctorOptions {
    json?: boolean;
    cliVersion?: string;
}
export declare function doctorCommand(options?: DoctorOptions): Promise<void>;
export {};
//# sourceMappingURL=doctor.d.ts.map