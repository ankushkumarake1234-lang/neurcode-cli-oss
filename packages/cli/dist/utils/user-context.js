"use strict";
/**
 * User Context Utility
 *
 * Provides user information (name, email) for personalized CLI messaging.
 * Caches user info to avoid repeated API calls.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserInfo = getUserInfo;
exports.clearUserCache = clearUserCache;
exports.getUserFirstName = getUserFirstName;
const config_1 = require("../config");
const api_client_1 = require("../api-client");
let cachedUserInfo = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
/**
 * Get current user information
 * Uses cache to avoid repeated API calls
 */
async function getUserInfo() {
    try {
        // Return cached info if still valid
        const now = Date.now();
        if (cachedUserInfo && (now - cacheTimestamp) < CACHE_TTL) {
            return cachedUserInfo;
        }
        const config = (0, config_1.loadConfig)();
        if (!config.apiKey) {
            return null;
        }
        const client = new api_client_1.ApiClient(config);
        const user = await client.getCurrentUser();
        // Build display name
        const displayName = user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.firstName || user.lastName || user.email.split('@')[0] || 'User';
        cachedUserInfo = {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            imageUrl: user.imageUrl,
            displayName,
        };
        cacheTimestamp = now;
        return cachedUserInfo;
    }
    catch (error) {
        // Silently fail - user info is optional for messaging
        return null;
    }
}
/**
 * Clear cached user info (useful after logout)
 */
function clearUserCache() {
    cachedUserInfo = null;
    cacheTimestamp = 0;
}
/**
 * Get user's first name or fallback
 */
async function getUserFirstName() {
    const user = await getUserInfo();
    return user?.firstName || user?.displayName.split(' ')[0] || 'there';
}
//# sourceMappingURL=user-context.js.map