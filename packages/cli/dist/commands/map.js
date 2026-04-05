"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadAssetMap = loadAssetMap;
exports.mapCommand = mapCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const ProjectScanner_1 = require("../services/mapper/ProjectScanner");
const project_root_1 = require("../utils/project-root");
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
 * Simple spinner simulation (just show a message)
 */
function showSpinner(message) {
    process.stdout.write(chalk.dim(`\r${message}...`));
}
function hideSpinner() {
    process.stdout.write('\r' + ' '.repeat(50) + '\r');
}
/**
 * Load existing asset map if it exists
 */
function loadAssetMap(rootDir = process.cwd()) {
    const resolvedRoot = rootDir ? (0, path_1.resolve)(rootDir) : (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const mapPath = (0, path_1.join)(resolvedRoot, '.neurcode', 'asset-map.json');
    if (!(0, fs_1.existsSync)(mapPath)) {
        return null;
    }
    try {
        const { readFileSync } = require('fs');
        const content = readFileSync(mapPath, 'utf-8');
        return JSON.parse(content);
    }
    catch (error) {
        return null;
    }
}
/**
 * Save asset map to .neurcode/asset-map.json
 */
function saveAssetMap(map, rootDir = process.cwd()) {
    const resolvedRoot = rootDir ? (0, path_1.resolve)(rootDir) : (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const neurcodeDir = (0, path_1.join)(resolvedRoot, '.neurcode');
    // Ensure .neurcode directory exists
    if (!(0, fs_1.existsSync)(neurcodeDir)) {
        (0, fs_1.mkdirSync)(neurcodeDir, { recursive: true });
    }
    const mapPath = (0, path_1.join)(neurcodeDir, 'asset-map.json');
    (0, fs_1.writeFileSync)(mapPath, JSON.stringify(map, null, 2) + '\n', 'utf-8');
}
/**
 * Map command: Scan codebase and generate asset map
 */
async function mapCommand(rootDir) {
    try {
        const cwd = rootDir ? (0, path_1.resolve)(rootDir) : (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const maxSourceFilesRaw = process.env.NEURCODE_ASSET_MAP_MAX_FILES;
        const maxFileBytesRaw = process.env.NEURCODE_ASSET_MAP_MAX_BYTES;
        const shallowScanBytesRaw = process.env.NEURCODE_ASSET_MAP_SHALLOW_SCAN_BYTES;
        const shallowScanWindowsRaw = process.env.NEURCODE_ASSET_MAP_SHALLOW_SCAN_WINDOWS;
        const adaptiveDeepenFilesRaw = process.env.NEURCODE_ASSET_MAP_ADAPTIVE_DEEPEN_FILES;
        const adaptiveDeepenTotalBytesRaw = process.env.NEURCODE_ASSET_MAP_ADAPTIVE_DEEPEN_TOTAL_BYTES;
        const adaptiveEscalateRaw = process.env.NEURCODE_ASSET_MAP_ESCALATE_DEEPEN;
        const adaptiveEscalateRatioRaw = process.env.NEURCODE_ASSET_MAP_ESCALATE_SHALLOW_RATIO;
        const adaptiveEscalateMinCandidatesRaw = process.env.NEURCODE_ASSET_MAP_ESCALATE_MIN_CANDIDATES;
        const adaptiveEscalateMaxFilesRaw = process.env.NEURCODE_ASSET_MAP_ESCALATE_MAX_FILES;
        const adaptiveEscalateMaxBytesRaw = process.env.NEURCODE_ASSET_MAP_ESCALATE_MAX_BYTES;
        const adaptiveDeepenIntent = (process.env.NEURCODE_ASSET_MAP_ADAPTIVE_DEEPEN_QUERY || '').trim();
        const maxSourceFiles = maxSourceFilesRaw && Number.isFinite(Number(maxSourceFilesRaw))
            ? Math.max(1, Math.floor(Number(maxSourceFilesRaw)))
            : 2000;
        const maxFileBytes = maxFileBytesRaw && Number.isFinite(Number(maxFileBytesRaw))
            ? Math.max(1, Math.floor(Number(maxFileBytesRaw)))
            : 1024 * 1024;
        const shallowScanBytes = shallowScanBytesRaw && Number.isFinite(Number(shallowScanBytesRaw))
            ? Math.max(1024, Math.floor(Number(shallowScanBytesRaw)))
            : 256 * 1024;
        const shallowScanWindows = shallowScanWindowsRaw && Number.isFinite(Number(shallowScanWindowsRaw))
            ? Math.max(1, Math.floor(Number(shallowScanWindowsRaw)))
            : 5;
        const maxAdaptiveDeepenFiles = adaptiveDeepenFilesRaw && Number.isFinite(Number(adaptiveDeepenFilesRaw))
            ? Math.max(0, Math.floor(Number(adaptiveDeepenFilesRaw)))
            : 0;
        const maxAdaptiveDeepenTotalBytes = adaptiveDeepenTotalBytesRaw && Number.isFinite(Number(adaptiveDeepenTotalBytesRaw))
            ? Math.max(0, Math.floor(Number(adaptiveDeepenTotalBytesRaw)))
            : 0;
        const enableAdaptiveEscalation = adaptiveEscalateRaw && adaptiveEscalateRaw.trim()
            ? !['0', 'false', 'no', 'off'].includes(adaptiveEscalateRaw.trim().toLowerCase())
            : false;
        const adaptiveEscalationShallowRatioThreshold = adaptiveEscalateRatioRaw && Number.isFinite(Number(adaptiveEscalateRatioRaw))
            ? Math.min(1, Math.max(0, Number(adaptiveEscalateRatioRaw)))
            : 0.35;
        const adaptiveEscalationMinCandidates = adaptiveEscalateMinCandidatesRaw && Number.isFinite(Number(adaptiveEscalateMinCandidatesRaw))
            ? Math.max(1, Math.floor(Number(adaptiveEscalateMinCandidatesRaw)))
            : 3;
        const maxAdaptiveEscalationFiles = adaptiveEscalateMaxFilesRaw && Number.isFinite(Number(adaptiveEscalateMaxFilesRaw))
            ? Math.max(1, Math.floor(Number(adaptiveEscalateMaxFilesRaw)))
            : 2;
        const maxAdaptiveEscalationTotalBytes = adaptiveEscalateMaxBytesRaw && Number.isFinite(Number(adaptiveEscalateMaxBytesRaw))
            ? Math.max(1, Math.floor(Number(adaptiveEscalateMaxBytesRaw)))
            : 1024 * 1024;
        showSpinner('Scanning codebase');
        const scanner = new ProjectScanner_1.ProjectScanner(cwd, {
            maxSourceFiles,
            maxFileBytes,
            shallowScanBytes,
            shallowScanWindows,
            adaptiveDeepenIntent,
            maxAdaptiveDeepenFiles,
            maxAdaptiveDeepenTotalBytes,
            enableAdaptiveEscalation,
            adaptiveEscalationShallowRatioThreshold,
            adaptiveEscalationMinCandidates,
            maxAdaptiveEscalationFiles,
            maxAdaptiveEscalationTotalBytes,
        });
        const map = await scanner.scan();
        hideSpinner();
        // Save the map
        saveAssetMap(map, cwd);
        // Display results
        const fileCount = Object.keys(map.files).length;
        const exportCount = map.globalExports.length;
        console.log(chalk.green(`\n✅ Mapped ${fileCount} files and ${exportCount} exported assets.`));
        console.log(chalk.dim(`   Asset map saved to: .neurcode/asset-map.json`));
        if (map.scanStats?.cappedByMaxSourceFiles) {
            console.log(chalk.yellow(`   ⚠️  Coverage capped at ${map.scanStats.indexedSourceFiles} files (limit ${map.scanStats.maxSourceFiles}).`));
            console.log(chalk.dim('      Increase NEURCODE_ASSET_MAP_MAX_FILES to index more files.'));
        }
        if ((map.scanStats?.skippedBySize || 0) > 0) {
            console.log(chalk.dim(`   ℹ️  Shallow-indexed ${map.scanStats?.skippedBySize} oversized source files (> ${map.scanStats?.maxFileBytes} bytes).`));
        }
        if ((map.scanStats?.shallowIndexFailures || 0) > 0) {
            console.log(chalk.yellow(`   ⚠️  Could not shallow-index ${map.scanStats?.shallowIndexFailures} oversized file(s).`));
        }
        if ((map.scanStats?.adaptiveDeepenedFiles || 0) > 0) {
            console.log(chalk.dim(`   🧠 Adaptive deepened ${map.scanStats?.adaptiveDeepenedFiles} oversized file(s).`));
        }
        if (map.scanStats?.adaptiveEscalationTriggered) {
            console.log(chalk.dim(`   🎯 Adaptive escalation triggered (${map.scanStats?.adaptiveEscalationReason || 'policy_trigger'}).`));
        }
        if ((map.scanStats?.adaptiveEscalationDeepenedFiles || 0) > 0) {
            console.log(chalk.dim(`   🚀 Escalation deepened ${map.scanStats?.adaptiveEscalationDeepenedFiles} additional oversized file(s).`));
        }
        // Show summary
        const exportsByType = map.globalExports.reduce((acc, exp) => {
            acc[exp.type] = (acc[exp.type] || 0) + 1;
            return acc;
        }, {});
        if (Object.keys(exportsByType).length > 0) {
            console.log(chalk.dim('\n   Exports by type:'));
            for (const [type, count] of Object.entries(exportsByType)) {
                console.log(chalk.dim(`     ${type}: ${count}`));
            }
        }
        console.log('');
    }
    catch (error) {
        hideSpinner();
        console.error(chalk.red('\n❌ Error mapping codebase:'));
        if (error instanceof Error) {
            console.error(chalk.red(error.message));
            if (error.message.includes('ENOENT') || error.message.includes('not found')) {
                console.log(chalk.dim('\n💡 Make sure you are in a valid project directory'));
            }
        }
        else {
            console.error(error);
        }
        process.exit(1);
    }
}
//# sourceMappingURL=map.js.map