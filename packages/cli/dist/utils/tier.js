"use strict";
/**
 * Tier Utility
 *
 * Fetches and caches user tier to minimize API latency.
 * Caches tier in .neurcode/config.json for the session.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserTier = getUserTier;
exports.clearTierCache = clearTierCache;
exports.isProUser = isProUser;
const fs_1 = require("fs");
const path_1 = require("path");
const config_1 = require("../config");
const project_root_1 = require("./project-root");
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let memoryCache = null;
/**
 * Get user tier from API or cache
 * Defaults to 'FREE' if tier cannot be determined
 */
async function getUserTier() {
    try {
        // Check memory cache first
        const now = Date.now();
        if (memoryCache && (now - memoryCache.cachedAt) < CACHE_TTL) {
            return memoryCache.tier;
        }
        // Check file cache
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const neurcodeDir = (0, path_1.join)(projectRoot, '.neurcode');
        const configPath = (0, path_1.join)(neurcodeDir, 'config.json');
        if ((0, fs_1.existsSync)(configPath)) {
            try {
                const fileContent = (0, fs_1.readFileSync)(configPath, 'utf-8');
                const config = JSON.parse(fileContent);
                if (config.tier && config.tierCachedAt) {
                    const cacheAge = now - config.tierCachedAt;
                    if (cacheAge < CACHE_TTL) {
                        const tier = config.tier;
                        memoryCache = { tier, cachedAt: config.tierCachedAt };
                        return tier;
                    }
                }
            }
            catch (error) {
                // Ignore parse errors, continue to API fetch
            }
        }
        // Fetch from API
        const config = (0, config_1.loadConfig)();
        // FORCE PRIORITY: Check Env Var explicitly
        const envKey = process.env.NEURCODE_API_KEY;
        const finalApiKey = envKey || config.apiKey;
        if (!finalApiKey) {
            return 'FREE';
        }
        const apiUrl = (config.apiUrl || 'https://api.neurcode.com').replace(/\/$/, '');
        // Try to get tier from subscription endpoint
        try {
            const response = await fetch(`${apiUrl}/api/v1/subscriptions/status`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${finalApiKey}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                // If not authorized or subscription not found, default to FREE
                return 'FREE';
            }
            // API returns { subscription: { status, ... }, plan: { slug, ... }, isTrial, ... }
            const data = await response.json();
            const planSlug = data.plan?.slug;
            const subStatus = data.subscription?.status;
            const isTrial = !!data.isTrial;
            // PRO tier if: professional OR team-professional plan AND (active status OR trial status)
            const isProfessional = planSlug === 'professional' || planSlug === 'team-professional';
            const tier = isProfessional &&
                (subStatus === 'active' || subStatus === 'trial' || isTrial)
                ? 'PRO' : 'FREE';
            // Cache the tier
            cacheTier(tier);
            return tier;
        }
        catch (error) {
            // If subscription endpoint fails, default to FREE
            // Don't log warning to avoid noise - this is expected for FREE users
            return 'FREE';
        }
    }
    catch (error) {
        // Fail-safe: default to FREE
        return 'FREE';
    }
}
/**
 * Cache tier in memory and file
 */
function cacheTier(tier) {
    const now = Date.now();
    memoryCache = { tier, cachedAt: now };
    try {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const neurcodeDir = (0, path_1.join)(projectRoot, '.neurcode');
        const configPath = (0, path_1.join)(neurcodeDir, 'config.json');
        // Ensure .neurcode directory exists
        if (!(0, fs_1.existsSync)(neurcodeDir)) {
            (0, fs_1.mkdirSync)(neurcodeDir, { recursive: true });
        }
        // Read existing config or create new
        let config = {};
        if ((0, fs_1.existsSync)(configPath)) {
            try {
                const fileContent = (0, fs_1.readFileSync)(configPath, 'utf-8');
                config = JSON.parse(fileContent);
            }
            catch (error) {
                // If parse fails, start with empty config
            }
        }
        // Update tier cache
        config.tier = tier;
        config.tierCachedAt = now;
        // Write back to file
        (0, fs_1.writeFileSync)(configPath, JSON.stringify(config, null, 2), 'utf-8');
    }
    catch (error) {
        // Ignore file write errors - memory cache is still valid
    }
}
/**
 * Clear tier cache (useful after tier changes)
 */
function clearTierCache() {
    memoryCache = null;
    try {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const neurcodeDir = (0, path_1.join)(projectRoot, '.neurcode');
        const configPath = (0, path_1.join)(neurcodeDir, 'config.json');
        if ((0, fs_1.existsSync)(configPath)) {
            const fileContent = (0, fs_1.readFileSync)(configPath, 'utf-8');
            const config = JSON.parse(fileContent);
            delete config.tier;
            delete config.tierCachedAt;
            (0, fs_1.writeFileSync)(configPath, JSON.stringify(config, null, 2), 'utf-8');
        }
    }
    catch (error) {
        // Ignore errors
    }
}
/**
 * Check if user has PRO tier
 */
async function isProUser() {
    const tier = await getUserTier();
    return tier === 'PRO';
}
//# sourceMappingURL=tier.js.map