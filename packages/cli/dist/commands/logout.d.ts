/**
 * Logout Command
 *
 * In a multi-tenant world, API keys are org-scoped.
 * Default behavior:
 * - If you're in a linked project directory (has orgId): remove the key for that org only.
 * - Otherwise: remove all saved keys.
 */
export declare function logoutCommand(options?: {
    all?: boolean;
    orgId?: string;
}): Promise<void>;
//# sourceMappingURL=logout.d.ts.map