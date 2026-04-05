"use strict";
/**
 * Logout Command
 *
 * In a multi-tenant world, API keys are org-scoped.
 * Default behavior:
 * - If you're in a linked project directory (has orgId): remove the key for that org only.
 * - Otherwise: remove all saved keys.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logoutCommand = logoutCommand;
const config_1 = require("../config");
const user_context_1 = require("../utils/user-context");
const state_1 = require("../utils/state");
// Import chalk with fallback
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (str) => str,
        yellow: (str) => str,
        red: (str) => str,
        bold: (str) => str,
        dim: (str) => str,
        cyan: (str) => str,
        white: (str) => str,
    };
}
async function logoutCommand(options) {
    try {
        const inferredOrgId = (0, state_1.getOrgId)();
        const inferredOrgName = (0, state_1.getOrgName)();
        const targetOrgId = options?.orgId || inferredOrgId || undefined;
        const removeAll = options?.all === true || !targetOrgId;
        // Delete API key from all file-based sources
        const result = (0, config_1.deleteApiKeyFromAllSources)({
            all: removeAll,
            orgId: removeAll ? undefined : targetOrgId,
        });
        (0, user_context_1.clearUserCache)();
        if (!result.removedFromGlobal && !result.removedFromLocal) {
            if (!removeAll && targetOrgId) {
                console.log(chalk.yellow('\n⚠️  No API key found for this organization.\n'));
                console.log(chalk.dim(`   Org: ${inferredOrgName || targetOrgId}`));
                console.log(chalk.dim('   Run "neurcode login" to authenticate for this org.\n'));
            }
            else {
                console.log(chalk.yellow('\n⚠️  You are not currently logged in.\n'));
                console.log(chalk.dim('   No API key found in configuration files.\n'));
                console.log(chalk.dim('   Run "neurcode login" to authenticate.\n'));
            }
            return;
        }
        console.log(chalk.green('\n✅ Successfully logged out!\n'));
        const removedFrom = [];
        if (result.removedFromGlobal) {
            removedFrom.push('~/.neurcoderc');
        }
        if (result.removedFromLocal) {
            removedFrom.push('neurcode.config.json');
        }
        if (removedFrom.length > 0) {
            console.log(chalk.dim(`   API key removed from: ${removedFrom.join(', ')}`));
        }
        if (!removeAll && targetOrgId) {
            console.log(chalk.dim(`   Org scope removed: ${targetOrgId}`));
        }
        else if (removeAll && result.removedOrgIds && result.removedOrgIds.length > 0) {
            console.log(chalk.dim(`   Removed ${result.removedOrgIds.length} org-scoped key(s)`));
        }
        console.log(chalk.dim('   You can log in again with: neurcode login\n'));
    }
    catch (error) {
        console.error(chalk.red('\n❌ Error during logout:'));
        if (error instanceof Error) {
            console.error(chalk.red(error.message));
        }
        else {
            console.error(error);
        }
        console.log(chalk.dim('\n💡 If the issue persists, manually delete:'));
        console.log(chalk.dim('   - ~/.neurcoderc'));
        console.log(chalk.dim('   - neurcode.config.json (if present)\n'));
        process.exit(1);
    }
}
//# sourceMappingURL=logout.js.map