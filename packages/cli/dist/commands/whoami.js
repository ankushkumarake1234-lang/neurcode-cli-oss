"use strict";
/**
 * Whoami Command - Show Current Identity & Project Scope
 *
 * Displays:
 * 1. Logged-in user info (email, name)
 * 2. Current project scope (if inside a linked folder)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.whoamiCommand = whoamiCommand;
const config_1 = require("../config");
const state_1 = require("../utils/state");
const user_context_1 = require("../utils/user-context");
const messages_1 = require("../utils/messages");
// Import chalk with fallback
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (str) => str,
        yellow: (str) => str,
        bold: (str) => str,
        dim: (str) => str,
        cyan: (str) => str,
        white: (str) => str,
    };
}
async function whoamiCommand() {
    // ─── Authentication Status ────────────────────────────────
    const apiKey = (0, config_1.getApiKey)();
    if (!apiKey) {
        (0, messages_1.printWarning)('Not Logged In', 'Run "neurcode login" to authenticate.');
        process.exit(1);
    }
    (0, messages_1.printSection)('Identity', '👤');
    // Try to get detailed user info
    const userInfo = await (0, user_context_1.getUserInfo)();
    if (userInfo) {
        console.log(chalk.white('   Logged in as:'), chalk.bold.cyan(userInfo.email || 'unknown'));
        if (userInfo.displayName) {
            console.log(chalk.white('   Name:       '), chalk.dim(userInfo.displayName));
        }
    }
    else {
        console.log(chalk.white('   Status:'), chalk.green('Authenticated'));
        console.log(chalk.dim('   (Run "neurcode doctor" for full diagnostics)'));
    }
    // ─── Project Scope ────────────────────────────────────────
    const orgId = (0, state_1.getOrgId)();
    const orgName = (0, state_1.getOrgName)();
    const projectId = (0, state_1.getProjectId)();
    console.log('');
    (0, messages_1.printSection)('Project Scope', '📁');
    if (orgId && projectId) {
        console.log(chalk.white('   Organization:'), chalk.bold.cyan(orgName || orgId));
        console.log(chalk.white('   Org ID:      '), chalk.dim(orgId));
        console.log(chalk.white('   Project ID:  '), chalk.dim(projectId));
        console.log(chalk.dim('\n   All commands in this directory target this scope.'));
    }
    else if (projectId) {
        console.log(chalk.white('   Project ID:  '), chalk.dim(projectId));
        (0, messages_1.printWarning)('No Organization Linked', 'Run "neurcode init" to link this directory to an organization.');
    }
    else {
        (0, messages_1.printWarning)('Not in a Linked Project', 'Run "neurcode init" to link this directory to an organization and project.');
    }
    console.log('');
}
//# sourceMappingURL=whoami.js.map