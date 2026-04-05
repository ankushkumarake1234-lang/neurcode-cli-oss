"use strict";
/**
 * Doctor Command - Health Check & Connectivity Diagnostics
 *
 * Verifies API connectivity and reports system configuration
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.doctorCommand = doctorCommand;
const config_1 = require("../config");
const api_client_1 = require("../api-client");
const chalk_1 = __importDefault(require("chalk"));
const messages_1 = require("../utils/messages");
async function doctorCommand() {
    const userInfo = await (0, messages_1.getUserInfo)();
    const greeting = userInfo ? `, ${userInfo.displayName}` : '';
    await (0, messages_1.printSuccessBanner)('Neurcode CLI Health Check', `Running diagnostics${greeting}...`);
    let allChecksPassed = true;
    // Check 1: Configuration
    console.log(chalk_1.default.bold.white('📋 Configuration Check:'));
    const config = (0, config_1.loadConfig)();
    const apiUrl = config.apiUrl || config_1.DEFAULT_API_URL;
    const apiKey = (0, config_1.getApiKey)();
    console.log(chalk_1.default.dim(`   API URL: ${apiUrl}`));
    console.log(chalk_1.default.dim(`   API Key: ${apiKey ? '✅ Set' : '❌ Not set'}`));
    console.log(chalk_1.default.dim(`   Default URL: ${config_1.DEFAULT_API_URL}`));
    if (process.env.NEURCODE_API_URL) {
        console.log(chalk_1.default.dim(`   Env Var NEURCODE_API_URL: ${process.env.NEURCODE_API_URL}`));
    }
    console.log('');
    // Check 2: API Connectivity
    console.log(chalk_1.default.bold.white('🌐 Connectivity Check:'));
    try {
        const healthUrl = `${apiUrl}/health`;
        console.log(chalk_1.default.dim(`   Testing: ${healthUrl}`));
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        try {
            const response = await fetch(healthUrl, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'User-Agent': 'neurcode-cli-doctor',
                },
            });
            clearTimeout(timeoutId);
            if (response.ok) {
                const data = await response.json().catch(() => ({}));
                console.log(chalk_1.default.green('   ✅ API is reachable'));
                if (data.status) {
                    console.log(chalk_1.default.dim(`   Status: ${data.status}`));
                }
                if (data.version) {
                    console.log(chalk_1.default.dim(`   Version: ${data.version}`));
                }
            }
            else {
                console.log(chalk_1.default.yellow(`   ⚠️  API responded with status ${response.status}`));
                console.log(chalk_1.default.dim(`   This may indicate a server error`));
                allChecksPassed = false;
            }
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
                console.log(chalk_1.default.red('   ❌ Connection timeout (5s)'));
                console.log(chalk_1.default.dim('   The API may be unreachable or very slow'));
            }
            else {
                console.log(chalk_1.default.red('   ❌ Connection failed'));
                console.error(chalk_1.default.dim(`   Error: ${error instanceof Error ? error.message : String(error)}`));
            }
            allChecksPassed = false;
        }
    }
    catch (error) {
        console.log(chalk_1.default.red('   ❌ Health check failed'));
        console.error(chalk_1.default.dim(`   Error: ${error instanceof Error ? error.message : String(error)}`));
        allChecksPassed = false;
    }
    console.log('');
    // Check 3: Authenticated Endpoint (if API key is available)
    if (apiKey) {
        console.log(chalk_1.default.bold.white('🔐 Authentication Check:'));
        try {
            const client = new api_client_1.ApiClient(config);
            // Try a simple authenticated request
            console.log(chalk_1.default.dim('   Testing authenticated endpoint...'));
            // Try to get projects list (lightweight endpoint)
            const projects = await client.getProjects();
            console.log(chalk_1.default.green('   ✅ Authentication successful'));
            console.log(chalk_1.default.dim(`   Found ${projects.length} project(s)`));
        }
        catch (error) {
            console.log(chalk_1.default.red('   ❌ Authentication failed'));
            console.error(chalk_1.default.dim(`   Error: ${error instanceof Error ? error.message : String(error)}`));
            if (error instanceof Error && error.message.includes('401')) {
                console.log(chalk_1.default.yellow('\n   💡 Your API key may be invalid. Run: neurcode login'));
            }
            else if (error instanceof Error && error.message.includes('403')) {
                console.log(chalk_1.default.yellow('\n   💡 Your API key may not have proper permissions.'));
            }
            allChecksPassed = false;
        }
        console.log('');
    }
    else {
        console.log(chalk_1.default.bold.white('🔐 Authentication Check:'));
        console.log(chalk_1.default.yellow('   ⚠️  Skipped (no API key found)'));
        console.log(chalk_1.default.dim('   Run: neurcode login'));
        console.log('');
        allChecksPassed = false;
    }
    // Summary
    if (allChecksPassed) {
        await (0, messages_1.printSuccessBanner)('All Checks Passed!', 'Your Neurcode CLI is configured correctly and ready to use');
    }
    else {
        (0, messages_1.printSection)('Summary');
        (0, messages_1.printWarning)('Some Checks Failed', 'Please review the issues above and follow the suggestions');
        (0, messages_1.printInfo)('Troubleshooting Tips', [
            'If API is unreachable, check your internet connection',
            'Verify the API URL is correct (should be https://api.neurcode.com)',
            'Run: neurcode login (to authenticate)',
            'Set NEURCODE_API_URL env var to override default URL',
            'Check firewall/proxy settings if connection issues persist'
        ].join('\n   • '));
    }
}
//# sourceMappingURL=doctor.js.map