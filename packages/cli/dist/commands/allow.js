"use strict";
/**
 * Allow Command
 *
 * Manually whitelist a file to bypass the strict scope guard.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.allowCommand = allowCommand;
const config_1 = require("../config");
const api_client_1 = require("../api-client");
const state_1 = require("../utils/state");
const path_1 = require("path");
// Import chalk with fallback
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (str) => str,
        red: (str) => str,
        yellow: (str) => str,
        dim: (str) => str,
    };
}
/**
 * Normalize file path to be relative to project root
 */
function normalizeFilePath(filePath) {
    // Remove leading ./ if present
    let normalized = filePath.replace(/^\.\//, '');
    // Normalize path separators
    normalized = (0, path_1.normalize)(normalized).replace(/\\/g, '/');
    // Remove leading slash if present
    normalized = normalized.replace(/^\//, '');
    return normalized;
}
async function allowCommand(filePath) {
    try {
        // Get sessionId from state (.neurcode/config.json)
        const sessionId = (0, state_1.getSessionId)();
        if (!sessionId) {
            console.error(chalk.red('❌ Error: No active session found'));
            console.log(chalk.dim('\nTo use this command, you need an active session.'));
            console.log(chalk.dim('Run "neurcode plan" first to create a session.'));
            console.log(chalk.dim('\nThe session ID is automatically saved to .neurcode/config.json'));
            process.exit(1);
        }
        // Load base config for API client
        const config = (0, config_1.loadConfig)();
        if (!config.apiKey) {
            config.apiKey = (0, config_1.requireApiKey)();
        }
        // Normalize the file path
        const normalizedPath = normalizeFilePath(filePath);
        // Initialize API client
        const client = new api_client_1.ApiClient(config);
        // Call the API to allow the file
        console.log(chalk.dim(`Adding ${normalizedPath} to allowed list...`));
        try {
            await client.allowFile(sessionId, normalizedPath);
            console.log(chalk.green(`✅ File ${normalizedPath} added to allowed list.`));
            console.log(chalk.dim(`   Session: ${sessionId.substring(0, 8)}...`));
        }
        catch (error) {
            if (error instanceof Error) {
                console.error(chalk.red(`❌ Failed to allow ${normalizedPath}: ${error.message}`));
                console.error(chalk.dim('   The allow-list was not updated. Please retry after fixing connectivity/auth.'));
            }
            else {
                console.error(chalk.red(`❌ Failed to allow ${normalizedPath}: Unknown API error`));
            }
            process.exit(1);
        }
    }
    catch (error) {
        console.error(chalk.red('\n❌ Unexpected error:'));
        if (error instanceof Error) {
            console.error(chalk.red(error.message));
        }
        else {
            console.error(error);
        }
        process.exit(1);
    }
}
//# sourceMappingURL=allow.js.map