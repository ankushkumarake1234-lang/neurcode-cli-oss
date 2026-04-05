/**
 * User Context Utility
 *
 * Provides user information (name, email) for personalized CLI messaging.
 * Caches user info to avoid repeated API calls.
 */
export interface UserInfo {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    imageUrl?: string;
    displayName: string;
}
/**
 * Get current user information
 * Uses cache to avoid repeated API calls
 */
export declare function getUserInfo(): Promise<UserInfo | null>;
/**
 * Clear cached user info (useful after logout)
 */
export declare function clearUserCache(): void;
/**
 * Get user's first name or fallback
 */
export declare function getUserFirstName(): Promise<string>;
//# sourceMappingURL=user-context.d.ts.map