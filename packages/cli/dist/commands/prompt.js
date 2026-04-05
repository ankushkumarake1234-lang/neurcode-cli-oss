"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.promptCommand = promptCommand;
const config_1 = require("../config");
const api_client_1 = require("../api-client");
const state_1 = require("../utils/state");
const map_1 = require("./map");
const toolbox_service_1 = require("../services/toolbox-service");
const project_root_1 = require("../utils/project-root");
const fs_1 = require("fs");
const path_1 = require("path");
const core_1 = require("@neurcode-ai/core");
const policy_1 = require("@neurcode-ai/policy");
// Import chalk with fallback for plain strings if not available
let chalk;
try {
    chalk = require('chalk');
}
catch {
    // Fallback: create a mock chalk object that returns strings as-is
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
/**
 * Display prompt in a box
 */
function displayPromptBox(prompt) {
    const lines = prompt.split('\n');
    const maxWidth = Math.min(80, Math.max(...lines.map(l => l.length)) + 4);
    // Top border
    console.log(chalk.cyan('┌' + '─'.repeat(maxWidth - 2) + '┐'));
    // Content
    for (const line of lines) {
        const padding = maxWidth - line.length - 3;
        console.log(chalk.cyan('│ ') + chalk.white(line) + ' '.repeat(Math.max(0, padding)) + chalk.cyan(' │'));
    }
    // Bottom border
    console.log(chalk.cyan('└' + '─'.repeat(maxWidth - 2) + '┘'));
}
/**
 * Copy to clipboard using native OS commands
 */
async function copyToClipboard(text) {
    try {
        const { execSync } = await Promise.resolve().then(() => __importStar(require('child_process')));
        const platform = process.platform;
        if (platform === 'darwin') {
            // macOS
            execSync('pbcopy', { input: text });
            return true;
        }
        else if (platform === 'linux') {
            // Linux - try xclip first, then xsel
            try {
                execSync('xclip -selection clipboard', { input: text });
                return true;
            }
            catch {
                try {
                    execSync('xsel --clipboard --input', { input: text });
                    return true;
                }
                catch {
                    return false;
                }
            }
        }
        else if (platform === 'win32') {
            // Windows
            const { exec } = await Promise.resolve().then(() => __importStar(require('child_process')));
            return new Promise((resolve) => {
                const proc = exec('clip', (error) => {
                    resolve(!error);
                });
                if (proc.stdin) {
                    proc.stdin.write(text);
                    proc.stdin.end();
                }
                else {
                    resolve(false);
                }
            });
        }
        return false;
    }
    catch {
        return false;
    }
}
function emitPromptJson(payload) {
    console.log(JSON.stringify(payload, null, 2));
}
function writePromptOutputFile(projectRoot, outputPath, prompt) {
    const resolvedPath = (0, path_1.resolve)(projectRoot, outputPath);
    const dir = (0, path_1.dirname)(resolvedPath);
    if (!(0, fs_1.existsSync)(dir)) {
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    }
    (0, fs_1.writeFileSync)(resolvedPath, prompt, 'utf-8');
    return resolvedPath;
}
async function promptCommand(planId, options) {
    let finalPlanId = planId?.trim() || null;
    const commandStartedAt = Date.now();
    try {
        // Auto-detect planId from state if not provided
        if (!finalPlanId) {
            const lastPlanId = (0, state_1.getLastPlanId)();
            if (lastPlanId) {
                finalPlanId = lastPlanId;
                if (!options?.json) {
                    console.log(chalk.dim(`📋 Using last plan ID: ${finalPlanId.substring(0, 8)}...`));
                }
            }
            else {
                const message = 'Plan ID is required. Run "neurcode plan" first or pass --plan-id.';
                if (options?.json) {
                    emitPromptJson({
                        success: false,
                        planId: null,
                        intent: null,
                        prompt: null,
                        copied: false,
                        outputPath: null,
                        message,
                    });
                }
                else {
                    console.error(chalk.red('❌ Error: Plan ID is required'));
                    console.log(chalk.dim('Usage: neurcode prompt [plan-id]'));
                    console.log(chalk.dim('\nIf no plan-id is provided, it will use the last plan from "neurcode plan"'));
                    console.log(chalk.dim('Or run "neurcode plan" first to create a plan.'));
                }
                process.exit(1);
            }
        }
        if (!finalPlanId) {
            const message = 'Plan ID is required.';
            if (options?.json) {
                emitPromptJson({
                    success: false,
                    planId: null,
                    intent: null,
                    prompt: null,
                    copied: false,
                    outputPath: null,
                    message,
                });
            }
            else {
                console.error(chalk.red('❌ Error: Plan ID is required'));
                console.log(chalk.dim('Usage: neurcode prompt [plan-id]'));
            }
            process.exit(1);
        }
        // Load configuration
        const config = (0, config_1.loadConfig)();
        // Require API key
        if (!config.apiKey) {
            config.apiKey = (0, config_1.requireApiKey)();
        }
        // Initialize API client
        const client = new api_client_1.ApiClient(config);
        if (!options?.json) {
            console.log(chalk.dim(`📋 Fetching plan ${finalPlanId}...`));
        }
        // Fetch the prompt and intent from API
        const { prompt: apiPrompt, intent, telemetry: apiTelemetry } = await client.getPlanPrompt(finalPlanId);
        const planRecord = await client.getPlan(finalPlanId).catch(() => null);
        // Clean apiPrompt: Remove any existing "Available Tools" section to avoid duplication
        // The apiPrompt may contain an old toolbox summary from when the plan was originally generated
        // Use regex to strip ANY existing "Available Tools" block
        const toolsBlockRegex = /=== Available Tools[\s\S]*?=== END Available Tools ===/g;
        let cleanedPrompt = apiPrompt.replace(toolsBlockRegex, '');
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        // Try to load asset map and append toolbox summary if available
        let finalPrompt = cleanedPrompt;
        let contextCandidateFiles = [];
        try {
            const map = (0, map_1.loadAssetMap)(projectRoot);
            if (map && map.globalExports.length > 0) {
                const toolboxSummary = (0, toolbox_service_1.generateToolboxSummary)(map, intent);
                if (toolboxSummary) {
                    finalPrompt += toolboxSummary;
                }
            }
            if (map) {
                contextCandidateFiles = Object.keys(map.files || {});
            }
        }
        catch (error) {
            // Silently fail - toolbox summary is optional
            if (process.env.DEBUG) {
                console.warn(chalk.yellow(`⚠️  Could not load asset map: ${error instanceof Error ? error.message : 'Unknown error'}`));
            }
        }
        const plannedFiles = Array.isArray(planRecord?.content?.files)
            ? planRecord.content.files
                .filter((file) => file.action !== 'BLOCK')
                .map((file) => file.path)
            : [];
        contextCandidateFiles = [...new Set([...contextCandidateFiles, ...plannedFiles])];
        const contextPolicy = (0, policy_1.loadContextPolicy)(projectRoot);
        const contextAccess = (0, policy_1.evaluateContextAccess)(contextCandidateFiles, contextPolicy);
        const allowedPreview = contextAccess.allowedContextFiles.slice(0, 120);
        const deniedPreview = contextAccess.deniedReadFiles.slice(0, 60);
        const accessEnvelope = [
            '',
            '=== Context Access Envelope ===',
            'Use only the following repository context (AI Context Access Control):',
            ...allowedPreview.map((filePath) => `- ${filePath}`),
            ...(contextAccess.allowedContextFiles.length > allowedPreview.length
                ? [`- ... (${contextAccess.allowedContextFiles.length - allowedPreview.length} more allowed files)`]
                : []),
            deniedPreview.length > 0 ? '' : null,
            deniedPreview.length > 0 ? 'Do NOT read or use these denied paths:' : null,
            ...deniedPreview.map((filePath) => `- ${filePath}`),
            ...(contextAccess.deniedReadFiles.length > deniedPreview.length
                ? [`- ... (${contextAccess.deniedReadFiles.length - deniedPreview.length} more denied files)`]
                : []),
            '=== END Context Access Envelope ===',
            '',
        ].filter((line) => typeof line === 'string');
        finalPrompt += accessEnvelope.join('\n');
        const promptContextLogPath = (0, core_1.resolveNeurcodeFile)(projectRoot, core_1.PROMPT_CONTEXT_LOG_FILENAME);
        (0, core_1.writeJsonFile)(promptContextLogPath, {
            generatedAt: new Date().toISOString(),
            planId: finalPlanId,
            task: intent,
            policy: contextPolicy,
            contextProvided: contextAccess.allowedContextFiles,
            deniedContext: contextAccess.deniedReadFiles,
            sourceCandidates: contextCandidateFiles.length,
        });
        let outputPath = null;
        if (options?.output && options.output.trim()) {
            outputPath = writePromptOutputFile(projectRoot, options.output.trim(), finalPrompt);
        }
        // Copy is enabled by default unless explicitly disabled.
        let copied = false;
        if (options?.copy !== false) {
            copied = await copyToClipboard(finalPrompt);
        }
        const finalPromptChars = finalPrompt.length;
        const finalPromptLines = finalPrompt.length > 0 ? finalPrompt.split('\n').length : 0;
        const finalPromptEstimatedTokens = Math.max(1, Math.ceil(finalPromptChars / 4));
        const telemetry = {
            cliTimingMs: Date.now() - commandStartedAt,
            finalPrompt: {
                chars: finalPromptChars,
                lines: finalPromptLines,
                estimatedTokens: finalPromptEstimatedTokens,
            },
            ...(apiTelemetry
                ? {
                    api: {
                        timingMs: apiTelemetry.timingMs,
                        promptChars: apiTelemetry.promptChars,
                        promptLines: apiTelemetry.promptLines,
                        estimatedTokens: apiTelemetry.estimatedTokens,
                    },
                }
                : {}),
        };
        if (options?.json) {
            emitPromptJson({
                success: true,
                planId: finalPlanId,
                intent: intent || null,
                prompt: finalPrompt,
                copied,
                outputPath,
                telemetry,
                message: 'Prompt generated successfully',
            });
        }
        else {
            // Display the prompt in a box
            console.log('\n');
            displayPromptBox(finalPrompt);
            console.log('');
            console.log(chalk.green('✅ Plan converted to Cursor Prompt! Paste it into your AI editor to execute.'));
            if (options?.copy === false) {
                console.log(chalk.dim('📋 Clipboard copy skipped (--no-copy).'));
            }
            else if (copied) {
                console.log(chalk.green('📋 Prompt copied to clipboard automatically.'));
            }
            else {
                console.log(chalk.yellow('⚠️  Could not copy to clipboard automatically. Please manually copy the prompt above.'));
            }
            if (outputPath) {
                console.log(chalk.green(`📝 Prompt written to: ${outputPath}`));
            }
            console.log('');
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (options?.json) {
            emitPromptJson({
                success: false,
                planId: finalPlanId,
                intent: null,
                prompt: null,
                copied: false,
                outputPath: null,
                message: errorMessage,
            });
            process.exit(1);
        }
        console.error(chalk.red('\n❌ Error generating prompt:'));
        if (error instanceof Error) {
            console.error(chalk.red(error.message));
            if (error.message.includes('404') || error.message.includes('not found')) {
                console.log(chalk.dim('\n💡 Make sure:'));
                console.log(chalk.dim('  • The plan ID is correct'));
                console.log(chalk.dim('  • You have access to this plan'));
            }
            else if (error.message.includes('API request failed')) {
                console.log(chalk.dim('\n💡 Make sure:'));
                console.log(chalk.dim('  • Your API key is valid'));
                console.log(chalk.dim('  • The API URL is correct'));
                console.log(chalk.dim('  • You have network connectivity'));
            }
        }
        else {
            console.error(error);
        }
        process.exit(1);
    }
}
//# sourceMappingURL=prompt.js.map