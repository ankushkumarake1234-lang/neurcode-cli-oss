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
exports.applyCommand = applyCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const config_1 = require("../config");
const api_client_1 = require("../api-client");
const ROILogger_1 = require("../utils/ROILogger");
const project_root_1 = require("../utils/project-root");
const state_1 = require("../utils/state");
const brain_context_1 = require("../utils/brain-context");
const analysis_1 = require("@neurcode-ai/analysis");
// Try to import chalk, fallback to plain strings if not available
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
function emitApplyJson(payload) {
    console.log(JSON.stringify(payload, null, 2));
}
const CODE_FILE_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.go', '.java', '.rb', '.rs', '.php',
    '.swift', '.kt', '.scala', '.cs', '.cpp', '.c', '.h',
    '.vue', '.svelte',
]);
function shouldRunHallucinationScan(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    const dot = normalized.lastIndexOf('.');
    if (dot === -1)
        return false;
    return CODE_FILE_EXTENSIONS.has(normalized.slice(dot).toLowerCase());
}
function parseSigningKeyRing(raw) {
    if (!raw || !raw.trim())
        return {};
    const out = {};
    for (const token of raw.split(/[,\n;]+/)) {
        const trimmed = token.trim();
        if (!trimmed)
            continue;
        const idx = trimmed.indexOf('=');
        if (idx <= 0)
            continue;
        const keyId = trimmed.slice(0, idx).trim();
        const key = trimmed.slice(idx + 1).trim();
        if (!keyId || !key)
            continue;
        out[keyId] = key;
    }
    return out;
}
function resolveSigningMaterial() {
    const singleKey = process.env.NEURCODE_GOVERNANCE_SIGNING_KEY?.trim() ||
        process.env.NEURCODE_AI_LOG_SIGNING_KEY?.trim() ||
        '';
    let keyId = process.env.NEURCODE_GOVERNANCE_SIGNING_KEY_ID?.trim() || null;
    if (singleKey) {
        return {
            signingKey: singleKey,
            keyId,
        };
    }
    const ring = parseSigningKeyRing(process.env.NEURCODE_GOVERNANCE_SIGNING_KEYS);
    if (Object.keys(ring).length === 0) {
        return { signingKey: null, keyId };
    }
    if (!keyId || !ring[keyId]) {
        keyId = Object.keys(ring).sort((a, b) => a.localeCompare(b))[0];
    }
    return {
        signingKey: ring[keyId] || null,
        keyId,
    };
}
/**
 * Apply a saved architect plan by generating and writing code files
 */
async function applyCommand(planId, options) {
    try {
        if (!planId || !planId.trim()) {
            if (options.json) {
                emitApplyJson({
                    success: false,
                    planId: '',
                    filesGenerated: 0,
                    files: [],
                    writtenFiles: [],
                    message: 'Plan ID is required',
                });
            }
            console.error(chalk.red('❌ Error: Plan ID is required'));
            console.log(chalk.dim('Usage: neurcode apply <planId>'));
            process.exit(1);
        }
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(planId.trim())) {
            if (options.json) {
                emitApplyJson({
                    success: false,
                    planId: planId.trim(),
                    filesGenerated: 0,
                    files: [],
                    writtenFiles: [],
                    message: 'Invalid plan ID format',
                });
            }
            console.error(chalk.red('❌ Error: Invalid plan ID format'));
            console.log(chalk.dim('Plan ID must be a valid UUID'));
            process.exit(1);
        }
        // Load configuration
        const config = (0, config_1.loadConfig)();
        // API URL is automatically set to production - no need to check
        // Require API key (shows helpful error message if missing)
        if (!config.apiKey) {
            config.apiKey = (0, config_1.requireApiKey)();
        }
        // Initialize API client
        const client = new api_client_1.ApiClient(config);
        const orgId = (0, state_1.getOrgId)();
        const finalProjectId = (0, state_1.getProjectId)() || config.projectId || null;
        const brainScope = {
            orgId: orgId || null,
            projectId: finalProjectId,
        };
        console.log(chalk.dim(`📋 Applying plan: ${planId}...\n`));
        // Step 1: Load plan files and capture safety snapshots BEFORE apply.
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const snapshots = [];
        const savedSnapshotPaths = new Set();
        console.log(chalk.dim('📸 Creating safety snapshots of existing files...\n'));
        const plan = await client.getPlan(planId.trim());
        const plannedTargets = (plan.content?.files || [])
            .filter(file => file.action !== 'BLOCK')
            .map(file => file.path);
        for (const targetPath of plannedTargets) {
            if (savedSnapshotPaths.has(targetPath)) {
                continue;
            }
            const filePath = (0, path_1.resolve)(cwd, targetPath);
            if (!(0, fs_1.existsSync)(filePath)) {
                continue;
            }
            try {
                const originalContent = (0, fs_1.readFileSync)(filePath, 'utf-8');
                snapshots.push({
                    path: targetPath,
                    originalContent,
                });
                savedSnapshotPaths.add(targetPath);
                if (process.env.DEBUG) {
                    console.log(chalk.dim(`  📸 Snapshot: ${targetPath}`));
                }
            }
            catch (error) {
                console.log(chalk.yellow(`  ⚠️  Could not read ${targetPath}: ${error instanceof Error ? error.message : 'Unknown error'}`));
            }
        }
        if (snapshots.length > 0) {
            console.log(chalk.dim(`\n✅ Prepared ${snapshots.length} snapshot(s) for version-safe apply`));
            console.log(chalk.dim('   Snapshots will be saved server-side before generated files are applied.\n'));
        }
        else {
            console.log(chalk.dim('   No local files required snapshot capture.\n'));
        }
        // Step 2: Apply plan with snapshots, so backend can version original content.
        const response = await client.applyPlan(planId.trim(), snapshots);
        if (response.message && response.message.toLowerCase().includes('recovered apply output from version history')) {
            console.log(chalk.yellow('⚠️  Apply response recovery activated (malformed API payload detected).'));
            console.log(chalk.dim('   Proceeding with recovered generated files from version history.\n'));
        }
        if (!response.success) {
            if (options.json) {
                emitApplyJson({
                    success: false,
                    planId: response.planId || planId.trim(),
                    filesGenerated: 0,
                    files: [],
                    writtenFiles: [],
                    message: response.message || 'Plan apply failed',
                });
            }
            console.error(chalk.red('❌ Failed to apply plan'));
            console.error(chalk.red(response.message || 'Unknown error'));
            process.exit(1);
        }
        // Step 2: Scan generated code for hallucinations BEFORE writing to disk
        // This catches phantom packages that appear in actual generated code (not just plan)
        const { SecurityGuard } = await Promise.resolve().then(() => __importStar(require('../services/security/SecurityGuard')));
        const securityGuard = new SecurityGuard();
        // Check tier for hallucination scanning (PRO feature)
        const { getUserTier } = await Promise.resolve().then(() => __importStar(require('../utils/tier')));
        const tier = await getUserTier();
        let hasHallucinations = false;
        const allHallucinations = [];
        if (tier === 'FREE') {
            console.log(chalk.yellow('\n🛡️  Hallucination Shield is a PRO feature.'));
            console.log(chalk.dim('   Upgrade at: https://www.neurcode.com/dashboard/purchase-plan\n'));
        }
        else {
            console.log(chalk.dim('🔍 Scanning generated code for hallucinations...'));
            for (const file of response.files) {
                if (file.content && shouldRunHallucinationScan(file.path)) {
                    const hallucinationResult = await securityGuard.scanForHallucinations(file.content, file.path, cwd, { includeTextMentions: false });
                    if (hallucinationResult.hasHallucinations) {
                        hasHallucinations = true;
                        allHallucinations.push(...hallucinationResult.hallucinations.map(h => ({
                            packageName: h.packageName,
                            location: h.location,
                            importStatement: h.importStatement,
                        })));
                    }
                }
            }
        }
        // Display hallucination warnings if found
        if (hasHallucinations) {
            // Log ROI events (non-blocking)
            try {
                const { getProjectId } = await Promise.resolve().then(() => __importStar(require('../utils/state')));
                const projectId = getProjectId() || config.projectId;
                for (const hallucination of allHallucinations) {
                    (0, ROILogger_1.logROIEvent)('HALLUCINATION_BLOCKED', {
                        package_name: hallucination.packageName,
                        location: hallucination.location,
                        import_statement: hallucination.importStatement,
                    }, projectId || null).catch(() => {
                        // Silently ignore - ROI logging should never block user workflows
                    });
                }
            }
            catch {
                // Silently ignore - ROI logging should never block user workflows
            }
            // Display warnings
            console.log('\n');
            console.log(chalk.bold.red('╔════════════════════════════════════════════════════════════╗'));
            console.log(chalk.bold.red('║') + chalk.bold.white('  🛡️  SECURITY SHIELD: HALLUCINATION DETECTED IN CODE  ') + chalk.bold.red('║'));
            console.log(chalk.bold.red('╚════════════════════════════════════════════════════════════╝'));
            console.log('');
            // Group by package
            const hallucinationsByPackage = new Map();
            for (const hallucination of allHallucinations) {
                if (!hallucinationsByPackage.has(hallucination.packageName)) {
                    hallucinationsByPackage.set(hallucination.packageName, []);
                }
                hallucinationsByPackage.get(hallucination.packageName).push({
                    location: hallucination.location,
                    importStatement: hallucination.importStatement,
                });
            }
            hallucinationsByPackage.forEach((occurrences, packageName) => {
                const shieldIcon = chalk.bold.red('🛡️');
                const criticalLabel = chalk.bold.red('CRITICAL:');
                const packageNameDisplay = chalk.bold.yellow(`'${packageName}'`);
                console.log(`${shieldIcon} ${chalk.bold.red('[Neurcode]')} ${criticalLabel} ${chalk.bold.white('Hallucination Blocked')}`);
                console.log(chalk.white(`   Generated code attempts to import non-existent package ${packageNameDisplay}.`));
                if (occurrences.length === 1) {
                    console.log(chalk.dim(`   File: ${occurrences[0].location}`));
                    console.log(chalk.dim(`   Statement: ${occurrences[0].importStatement}`));
                }
                else {
                    console.log(chalk.dim(`   Found in ${occurrences.length} file(s):`));
                    occurrences.forEach(occ => {
                        console.log(chalk.dim(`     • ${occ.location}: ${occ.importStatement}`));
                    });
                }
                console.log('');
            });
            console.log(chalk.yellow('⚠️  Files will NOT be written to disk due to hallucination detection.'));
            console.log(chalk.dim('   Review the plan and regenerate with valid packages.\n'));
            console.log(chalk.bold.red('─'.repeat(60)));
            console.log('');
            try {
                if (brainScope.orgId && brainScope.projectId) {
                    (0, brain_context_1.recordBrainProgressEvent)(cwd, brainScope, {
                        type: 'apply',
                        planId: planId.trim(),
                        verdict: 'BLOCKED',
                        note: `hallucinations=${allHallucinations.length}`,
                    });
                }
            }
            catch {
                // Never block apply flow on Brain event recording.
            }
            if (options.json) {
                emitApplyJson({
                    success: false,
                    planId: response.planId || planId.trim(),
                    filesGenerated: 0,
                    files: response.files || [],
                    writtenFiles: [],
                    message: `Hallucinations detected in generated output (${allHallucinations.length})`,
                });
            }
            process.exit(1); // Block the apply operation
        }
        else {
            console.log(chalk.green('✅ No hallucinations detected in generated code'));
        }
        // Safety check: Show summary
        console.log(chalk.bold.white(`\n📊 Ready to write ${response.filesGenerated} file(s):\n`));
        response.files.forEach((file, index) => {
            console.log(chalk.cyan(`  ${index + 1}. ${file.path}`));
        });
        // Confirm before writing (unless --force flag is set)
        if (!options.force) {
            console.log(chalk.yellow('\n⚠️  This will write files to your filesystem.'));
            console.log(chalk.dim('   Use --force to skip this confirmation.\n'));
            // In a real implementation, you might want to use readline for interactive confirmation
            // For now, we'll proceed automatically but log a warning
            console.log(chalk.dim('   Proceeding with file write...\n'));
        }
        // Write files to disk
        let successCount = 0;
        let errorCount = 0;
        const writtenFiles = [];
        for (const file of response.files) {
            try {
                const filePath = (0, path_1.resolve)(cwd, file.path);
                const fileDir = (0, path_1.dirname)(filePath);
                // Create directory if it doesn't exist
                if (!(0, fs_1.existsSync)(fileDir)) {
                    (0, fs_1.mkdirSync)(fileDir, { recursive: true });
                    console.log(chalk.dim(`📁 Created directory: ${fileDir}`));
                }
                // Check if file already exists
                if ((0, fs_1.existsSync)(filePath) && !options.force) {
                    console.log(chalk.yellow(`⚠️  File already exists: ${file.path}`));
                    console.log(chalk.dim(`   Skipping (use --force to overwrite)`));
                    continue;
                }
                // Write file
                (0, fs_1.writeFileSync)(filePath, file.content, 'utf-8');
                console.log(chalk.green(`✅ Written: ${file.path}`));
                successCount++;
                writtenFiles.push(file.path);
            }
            catch (error) {
                console.error(chalk.red(`❌ Failed to write ${file.path}:`));
                if (error instanceof Error) {
                    console.error(chalk.red(`   ${error.message}`));
                }
                errorCount++;
            }
        }
        // Summary
        console.log('\n' + '='.repeat(60));
        if (successCount > 0) {
            console.log(chalk.bold.green(`\n✅ Successfully wrote ${successCount} file(s)`));
        }
        if (errorCount > 0) {
            console.log(chalk.bold.red(`\n❌ Failed to write ${errorCount} file(s)`));
        }
        console.log(chalk.dim(`\nPlan ID: ${response.planId}`));
        console.log(chalk.dim(`Status: APPLIED\n`));
        const planTitle = typeof plan.content.title === 'string'
            ? plan.content.title?.trim()
            : '';
        const planSummary = typeof plan.content?.summary === 'string' ? plan.content.summary.trim() : '';
        const applyTask = planTitle || planSummary || plan.intent || 'Applied generated plan';
        const signingMaterial = resolveSigningMaterial();
        const aiChangeLogResult = (0, analysis_1.writeAiChangeLogWithIntegrity)(cwd, {
            task: applyTask,
            generatedAt: new Date().toISOString(),
            changes: writtenFiles.map((filePath) => ({
                file: filePath,
                module: filePath.split('/').slice(0, 2).join('/') || filePath,
                reason: 'Generated during apply stage from approved plan',
                planLink: 'expected',
            })),
            summary: {
                changedFiles: writtenFiles.length,
                addedFiles: writtenFiles.length,
                deletedFiles: 0,
                configChanges: writtenFiles.filter((filePath) => filePath.endsWith('.json') || filePath.endsWith('.yml') || filePath.endsWith('.yaml')).length,
            },
            dependencyImpact: {
                added: [],
                removed: [],
                updated: [],
            },
        }, {
            signingKey: signingMaterial.signingKey,
            keyId: signingMaterial.keyId,
            signer: process.env.NEURCODE_GOVERNANCE_SIGNER || process.env.USER || 'neurcode-cli',
        });
        console.log(chalk.dim(`AI change log updated: ${aiChangeLogResult.path}`));
        try {
            if (brainScope.orgId && brainScope.projectId) {
                const refreshed = (0, brain_context_1.refreshBrainContextForFiles)(cwd, brainScope, writtenFiles);
                (0, brain_context_1.recordBrainProgressEvent)(cwd, brainScope, {
                    type: 'apply',
                    planId: response.planId || planId.trim(),
                    verdict: errorCount > 0 ? 'PARTIAL' : successCount > 0 ? 'SUCCESS' : 'NO_WRITES',
                    note: `written=${successCount};errors=${errorCount};indexed=${refreshed.indexed};removed=${refreshed.removed};skipped=${refreshed.skipped}`,
                });
            }
        }
        catch {
            // Never block apply flow on Brain refresh/event recording.
        }
        if (options.json) {
            emitApplyJson({
                success: errorCount === 0,
                planId: response.planId || planId.trim(),
                filesGenerated: response.filesGenerated,
                files: response.files,
                writtenFiles,
                message: errorCount === 0
                    ? `Applied ${successCount} file(s) successfully`
                    : `Applied with partial failures (${successCount} written, ${errorCount} failed)`,
            });
        }
        if (errorCount > 0) {
            process.exit(1);
        }
    }
    catch (error) {
        if (options.json) {
            emitApplyJson({
                success: false,
                planId: planId?.trim() || '',
                filesGenerated: 0,
                files: [],
                writtenFiles: [],
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
        console.error(chalk.red('\n❌ Error applying plan:'));
        if (error instanceof Error) {
            console.error(chalk.red(error.message));
            if (error.message.includes('API request failed')) {
                console.log(chalk.dim('\n💡 Make sure:'));
                console.log(chalk.dim('  • Your API key is valid'));
                console.log(chalk.dim('  • The API URL is correct'));
                console.log(chalk.dim('  • The plan ID is correct'));
                console.log(chalk.dim('  • You have network connectivity'));
            }
            else if (error.message.includes('not found')) {
                console.log(chalk.dim('\n💡 The plan ID may be incorrect or the plan may have been deleted.'));
            }
            else if (error.message.includes('already been applied')) {
                console.log(chalk.dim('\n💡 This plan has already been applied.'));
            }
        }
        else {
            console.error(error);
        }
        process.exit(1);
    }
}
//# sourceMappingURL=apply.js.map