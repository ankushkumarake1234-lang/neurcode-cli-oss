/**
 * Tier Utility
 *
 * Fetches and caches user tier to minimize API latency.
 * Caches tier in .neurcode/config.json for the session.
 */
export type UserTier = 'FREE' | 'PRO';
/**
 * Get user tier from API or cache
 * Defaults to 'FREE' if tier cannot be determined
 */
export declare function getUserTier(): Promise<UserTier>;
/**
 * Clear tier cache (useful after tier changes)
 */
export declare function clearTierCache(): void;
/**
 * Check if user has PRO tier
 */
export declare function isProUser(): Promise<boolean>;
//# sourceMappingURL=tier.d.ts.map