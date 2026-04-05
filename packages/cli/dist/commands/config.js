"use strict";
/**
 * Config Command
 *
 * Allows users to configure their API key locally for easier CLI usage.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configCommand = configCommand;
exports.showConfigCommand = showConfigCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const chalk_1 = __importDefault(require("chalk"));
/**
 * Validate API key format
 */
function validateApiKey(key) {
    if (!key || typeof key !== 'string') {
        return false;
    }
    // API keys should start with nk_ (nk_live_ or nk_test_)
    return key.startsWith('nk_');
}
/**
 * Save API key to config file
 */
function configCommand(key, options) {
    if (!key) {
        console.error(chalk_1.default.red('❌ Error: API key is required'));
        console.log(chalk_1.default.yellow('\nUsage:'));
        console.log(chalk_1.default.cyan('  neurcode config --key <your_api_key>'));
        console.log(chalk_1.default.cyan('  neurcode config --key <your_api_key> --global  # Save to home directory\n'));
        console.log(chalk_1.default.gray('Get your API key from: https://dashboard.neurcode.com/api-keys'));
        process.exit(1);
    }
    // Validate key format
    if (!validateApiKey(key)) {
        console.error(chalk_1.default.red('❌ Error: Invalid API key format'));
        console.log(chalk_1.default.yellow('\nAPI keys must start with "nk_" (e.g., nk_live_... or nk_test_...)'));
        console.log(chalk_1.default.gray('Get your API key from: https://dashboard.neurcode.com/api-keys\n'));
        process.exit(1);
    }
    // Determine config file path
    const configPath = options?.global
        ? (0, path_1.join)(process.env.HOME || process.env.USERPROFILE || '', 'neurcode.config.json')
        : (0, path_1.join)(process.cwd(), 'neurcode.config.json');
    try {
        // Load existing config if it exists
        let config = {};
        if ((0, fs_1.existsSync)(configPath)) {
            try {
                const existingContent = (0, fs_1.readFileSync)(configPath, 'utf-8');
                config = JSON.parse(existingContent);
            }
            catch (error) {
                console.warn(chalk_1.default.yellow(`⚠️  Warning: Could not parse existing config file, creating new one`));
            }
        }
        // Update API key
        config.apiKey = key;
        // Do NOT save apiUrl to config file - it defaults to production
        // Only save apiUrl if it was explicitly set (for enterprise/on-prem use cases)
        // For normal users, we use the default production URL
        // Create minimal config with only apiKey (and projectId if it exists)
        const configToSave = {
            apiKey: key,
        };
        // Preserve projectId if it exists
        if (config.projectId) {
            configToSave.projectId = config.projectId;
        }
        // Only save apiUrl if it was explicitly set in the existing config
        // (This is for enterprise/on-prem deployments)
        if (config.apiUrl && config.apiUrl !== 'https://api.neurcode.com') {
            configToSave.apiUrl = config.apiUrl;
        }
        // Write config file (minimal - only what's needed)
        (0, fs_1.writeFileSync)(configPath, JSON.stringify(configToSave, null, 2) + '\n', 'utf-8');
        console.log(chalk_1.default.green('\n✅ API Key saved. Connected to Neurcode Web.\n'));
        if (options?.global) {
            console.log(chalk_1.default.cyan('💡 This key will be used for all projects unless overridden locally.\n'));
        }
        else {
            console.log(chalk_1.default.cyan('💡 This key will be used for this project.\n'));
            console.log(chalk_1.default.gray('   Tip: Use --global flag to save for all projects\n'));
        }
        console.log(chalk_1.default.green('🚀 You are ready to go! Try:'));
        console.log(chalk_1.default.cyan('   neurcode plan "Add a new feature"'));
        console.log(chalk_1.default.cyan('   neurcode check --staged\n'));
    }
    catch (error) {
        console.error(chalk_1.default.red(`❌ Error saving config: ${error.message}`));
        process.exit(1);
    }
}
/**
 * Show current configuration
 */
function showConfigCommand() {
    const { loadConfig } = require('../config');
    const config = loadConfig();
    console.log(chalk_1.default.bold('\n📋 Current Configuration\n'));
    if (config.apiKey) {
        const maskedKey = config.apiKey.substring(0, 12) + '...' + config.apiKey.substring(config.apiKey.length - 4);
        console.log(chalk_1.default.green(`✅ API Key: ${maskedKey}`));
        // Show source
        if (process.env.NEURCODE_API_KEY) {
            console.log(chalk_1.default.gray('   Source: Environment variable (NEURCODE_API_KEY)'));
        }
        else {
            console.log(chalk_1.default.gray('   Source: Config file'));
        }
    }
    else {
        console.log(chalk_1.default.red('❌ API Key: Not set'));
    }
    // Show API URL only if it's not the default (for enterprise/on-prem users)
    if (config.apiUrl && config.apiUrl !== 'https://api.neurcode.com') {
        console.log(chalk_1.default.cyan(`🌐 API URL: ${config.apiUrl} (custom)`));
    }
    else {
        console.log(chalk_1.default.gray('🌐 API URL: https://api.neurcode.com (production)'));
    }
    if (config.projectId) {
        console.log(chalk_1.default.blue(`📁 Project ID: ${config.projectId}`));
    }
    else {
        console.log(chalk_1.default.gray('📁 Project ID: Not set'));
    }
    console.log('');
}
//# sourceMappingURL=config.js.map