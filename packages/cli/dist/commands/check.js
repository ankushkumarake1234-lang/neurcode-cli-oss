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
exports.checkCommand = checkCommand;
const child_process_1 = require("child_process");
const git_1 = require("../utils/git");
const diff_parser_1 = require("@neurcode-ai/diff-parser");
const rules_1 = require("../rules");
const config_1 = require("../config");
const api_client_1 = require("../api-client");
const project_detector_1 = require("../utils/project-detector");
const promises_1 = require("readline/promises");
const process_1 = require("process");
const messages_1 = require("../utils/messages");
async function checkCommand(options) {
    try {
        // Determines which diff to capture
        let diffText;
        if (options.staged) {
            diffText = (0, child_process_1.execSync)('git diff --staged', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
        }
        else if (options.base) {
            diffText = (0, git_1.getDiffFromBase)(options.base);
        }
        else if (options.head) {
            diffText = (0, child_process_1.execSync)('git diff HEAD', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
        }
        else {
            // Default: check staged, fallback to HEAD
            try {
                diffText = (0, child_process_1.execSync)('git diff --staged', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
            }
            catch {
                diffText = (0, child_process_1.execSync)('git diff HEAD', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
            }
        }
        if (!diffText.trim()) {
            (0, messages_1.printSuccess)('No changes detected', 'Your working directory is clean. Nothing to analyze.');
            process.exit(0);
        }
        // Try online mode if requested
        if (options.online || options.ai) {
            let projectId;
            try {
                const config = (0, config_1.loadConfig)();
                // Require API key
                if (!config.apiKey) {
                    config.apiKey = (0, config_1.requireApiKey)();
                }
                // If --ai is used without --intent, prompt for intent in interactive terminal
                if (options.ai && !options.intent && process.stdout.isTTY && !process.env.CI) {
                    try {
                        const rl = (0, promises_1.createInterface)({ input: process_1.stdin, output: process_1.stdout });
                        const intent = await rl.question('What is the intent of this session? ');
                        rl.close();
                        if (intent && intent.trim()) {
                            options.intent = intent.trim();
                        }
                    }
                    catch (promptError) {
                        // If prompt fails, continue without intent
                        console.warn('⚠️  Could not prompt for intent, continuing without it');
                    }
                }
                const client = new api_client_1.ApiClient(config);
                // Implicit Project Discovery: Auto-detect and connect project
                projectId = config.projectId;
                if (!projectId) {
                    try {
                        const projectInfo = (0, project_detector_1.detectProject)();
                        if (projectInfo.gitUrl) {
                            const project = await client.ensureProject(projectInfo.gitUrl, projectInfo.name || undefined);
                            projectId = project.id;
                            // Save projectId to config file
                            const { writeFileSync, existsSync, readFileSync } = await Promise.resolve().then(() => __importStar(require('fs')));
                            const { join } = await Promise.resolve().then(() => __importStar(require('path')));
                            const configPath = join(process.cwd(), 'neurcode.config.json');
                            let configData = {};
                            if (existsSync(configPath)) {
                                try {
                                    configData = JSON.parse(readFileSync(configPath, 'utf-8'));
                                }
                                catch {
                                    // Ignore parse errors
                                }
                            }
                            configData.apiKey = config.apiKey;
                            configData.projectId = projectId;
                            writeFileSync(configPath, JSON.stringify(configData, null, 2) + '\n', 'utf-8');
                        }
                    }
                    catch (error) {
                        // Graceful degradation - continue without project
                    }
                }
                if (options.ai) {
                    // AI-powered analysis with session tracking
                    (0, messages_1.printProgress)('Analyzing your code with Neurcode AI');
                    // Read file contents for all changed files to enable proper revert
                    const diffFiles = (0, diff_parser_1.parseDiff)(diffText);
                    const fileContents = {};
                    try {
                        const fs = await Promise.resolve().then(() => __importStar(require('fs')));
                        const path = await Promise.resolve().then(() => __importStar(require('path')));
                        for (const file of diffFiles) {
                            try {
                                // Try multiple path variations to find the file
                                const pathsToTry = [
                                    file.path, // Original path from diff
                                    file.path.replace(/^b\//, ''), // Without "b/" prefix
                                    file.path.startsWith('b/') ? file.path : `b/${file.path}`, // With "b/" prefix
                                    path.basename(file.path), // Just filename
                                ];
                                for (const filePath of pathsToTry) {
                                    if (fs.existsSync(filePath)) {
                                        const content = fs.readFileSync(filePath, 'utf-8');
                                        // Store with multiple keys to ensure matching
                                        fileContents[file.path] = content; // Original path
                                        fileContents[filePath] = content; // Actual file path
                                        // Also store without b/ prefix for matching
                                        const pathWithoutBPrefix = file.path.replace(/^b\//, '');
                                        if (pathWithoutBPrefix !== file.path) {
                                            fileContents[pathWithoutBPrefix] = content;
                                        }
                                        break; // Found the file, no need to try other paths
                                    }
                                }
                            }
                            catch (err) {
                                // File might not exist (e.g., deleted), skip it
                                // We'll use diff as fallback
                            }
                        }
                    }
                    catch (err) {
                        // If we can't read files, continue without fileContents
                        // The API will use diff as fallback
                    }
                    const aiResult = await client.analyzeBloat(diffText, options.intent, projectId, options.sessionId, Object.keys(fileContents).length > 0 ? fileContents : undefined);
                    (0, messages_1.printProgressComplete)(true);
                    // Display AI analysis results
                    await (0, messages_1.printSuccessBanner)('AI Analysis Complete');
                    (0, messages_1.printSection)('Analysis Results');
                    if (aiResult.sessionId) {
                        console.log(`\n🎯 Session ID: ${aiResult.sessionId}`);
                        console.log(`   View in dashboard: https://neurcode.com/dashboard/sessions/${aiResult.sessionId}`);
                    }
                    else {
                        console.log(`\n⚠️  Session tracking unavailable (analysis completed successfully)`);
                    }
                    console.log(`\n📈 Redundancy Analysis:`);
                    console.log(`   Original Lines: ${aiResult.analysis.redundancy.originalLines}`);
                    console.log(`   Suggested Lines: ${aiResult.analysis.redundancy.suggestedLines}`);
                    console.log(`   Redundancy: ${aiResult.analysis.redundancy.redundancyPercentage}%`);
                    console.log(`   Token Savings: ${aiResult.analysis.redundancy.tokenSavings.toLocaleString()}`);
                    // Show cost with appropriate precision (4 decimal places for small amounts)
                    const costSavings = aiResult.analysis.redundancy.costSavings;
                    const costDisplay = costSavings < 0.01
                        ? `$${costSavings.toFixed(6)}`
                        : `$${costSavings.toFixed(2)}`;
                    console.log(`   Cost Savings: ${costDisplay}`);
                    if (aiResult.analysis.redundancy.redundantBlocks.length > 0) {
                        console.log(`\n⚠️  Redundant Blocks Found:`);
                        aiResult.analysis.redundancy.redundantBlocks.forEach((block, i) => {
                            console.log(`   ${i + 1}. Lines ${block.lines[0]}-${block.lines[1]}: ${block.reason}`);
                            console.log(`      Suggestion: ${block.suggestion}`);
                        });
                    }
                    console.log(`\n🎯 Intent Match:`);
                    console.log(`   Matches: ${aiResult.analysis.intentMatch.matches ? '✅ Yes' : '❌ No'}`);
                    console.log(`   Confidence: ${aiResult.analysis.intentMatch.confidence}%`);
                    console.log(`   Explanation: ${aiResult.analysis.intentMatch.explanation}`);
                    if (aiResult.analysis.intentMatch.mismatches.length > 0) {
                        console.log(`\n⚠️  Intent Mismatches:`);
                        aiResult.analysis.intentMatch.mismatches.forEach((mismatch) => {
                            console.log(`   - ${mismatch.file}: ${mismatch.reason}`);
                        });
                    }
                    console.log(`\n💡 Recommendation: ${aiResult.analysis.recommendation.toUpperCase()}`);
                    console.log(`\n${aiResult.analysis.summary}`);
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
                    // Exit with appropriate code based on recommendation
                    if (aiResult.analysis.recommendation === 'block') {
                        process.exit(2);
                    }
                    else if (aiResult.analysis.recommendation === 'warn') {
                        process.exit(1);
                    }
                    else {
                        process.exit(0);
                    }
                }
                else {
                    // Basic rule-based analysis
                    (0, messages_1.printProgress)('Analyzing code against governance policies');
                    const apiResult = await client.analyzeDiff(diffText, projectId);
                    (0, messages_1.printProgressComplete)(true);
                    // Display results from API
                    displayResults(apiResult.summary, {
                        decision: apiResult.decision,
                        violations: apiResult.violations
                    }, apiResult.logId);
                    // Exit with appropriate code
                    if (apiResult.decision === 'block') {
                        process.exit(2);
                    }
                    else if (apiResult.decision === 'warn') {
                        process.exit(1);
                    }
                    else {
                        process.exit(0);
                    }
                }
            }
            catch (error) {
                (0, messages_1.printProgressComplete)(false);
                if (error instanceof Error) {
                    if (error.message.includes('401') || error.message.includes('403')) {
                        await (0, messages_1.printAuthError)(error);
                    }
                    else if (error.message.includes('project') || error.message.includes('404')) {
                        (0, messages_1.printProjectError)(error, projectId);
                    }
                    else {
                        (0, messages_1.printError)('Online analysis failed', error);
                    }
                }
                else {
                    (0, messages_1.printError)('Online analysis failed', String(error));
                }
                (0, messages_1.printWarning)('Falling back to local analysis', 'Using local policy rules (may differ from your organization policies)');
                // Fall through to local mode
            }
        }
        // Local mode (default or fallback)
        // Parse the diff
        const diffFiles = (0, diff_parser_1.parseDiff)(diffText);
        if (diffFiles.length === 0) {
            console.log('✓ No file changes detected');
            process.exit(0);
        }
        // Get summary
        const summary = (0, diff_parser_1.getDiffSummary)(diffFiles);
        // Evaluate rules
        const result = (0, rules_1.evaluateRules)(diffFiles);
        // Display results
        displayResults(summary, result);
        // Exit with appropriate code
        if (result.decision === 'block') {
            process.exit(2);
        }
        else if (result.decision === 'warn') {
            process.exit(1);
        }
        else {
            process.exit(0);
        }
    }
    catch (error) {
        if (error instanceof Error) {
            // Check if it's a git error
            if (error.message.includes('not a git repository')) {
                (0, messages_1.printError)('Not a Git Repository', error, [
                    'This command must be run in a git repository',
                    'Initialize git: git init',
                    'Or navigate to a git repository directory'
                ]);
            }
            else if (error.message.includes('git diff')) {
                (0, messages_1.printError)('Git Command Failed', error, [
                    'Make sure git is installed and accessible',
                    'Check if you have staged changes: git status',
                    'Verify git is working: git --version'
                ]);
            }
            else {
                (0, messages_1.printError)('Command Failed', error);
            }
        }
        else {
            (0, messages_1.printError)('Unknown Error', String(error));
        }
        process.exit(1);
    }
}
/**
 * Display analysis results
 */
function displayResults(summary, result, logId) {
    // Print results
    console.log('\n📊 Diff Analysis Summary');
    if (logId) {
        console.log(`Log ID: ${logId}`);
    }
    console.log('─'.repeat(50));
    console.log(`Files changed: ${summary.totalFiles}`);
    console.log(`Lines added: ${summary.totalAdded}`);
    console.log(`Lines removed: ${summary.totalRemoved}`);
    console.log(`Net change: ${summary.totalAdded - summary.totalRemoved > 0 ? '+' : ''}${summary.totalAdded - summary.totalRemoved}`);
    // Print file list
    console.log('\n📁 Changed Files:');
    summary.files.forEach(file => {
        const changeIcon = file.changeType === 'add' ? '➕' :
            file.changeType === 'delete' ? '➖' :
                file.changeType === 'rename' ? '🔄' : '✏️';
        console.log(`  ${changeIcon} ${file.path} (${file.changeType})`);
    });
    // Print rule violations
    if (result.violations.length > 0) {
        console.log('\n⚠️  Rule Violations:');
        result.violations.forEach(violation => {
            const severityIcon = violation.severity === 'block' ? '🚫' : '⚠️';
            console.log(`  ${severityIcon} [${violation.severity.toUpperCase()}] ${violation.rule}`);
            console.log(`     File: ${violation.file}`);
            if (violation.message) {
                console.log(`     ${violation.message}`);
            }
        });
    }
    else {
        console.log('\n✓ No rule violations detected');
    }
    // Print decision
    console.log('\n' + '─'.repeat(50));
    const decisionIcon = result.decision === 'allow' ? '✓' :
        result.decision === 'warn' ? '⚠️' : '🚫';
    console.log(`Decision: ${decisionIcon} ${result.decision.toUpperCase()}`);
}
//# sourceMappingURL=check.js.map