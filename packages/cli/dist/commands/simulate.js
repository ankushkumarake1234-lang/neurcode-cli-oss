"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulateCommand = simulateCommand;
const project_root_1 = require("../utils/project-root");
const breakage_simulator_1 = require("../utils/breakage-simulator");
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
function severityColor(severity) {
    if (severity === 'high')
        return chalk.red;
    if (severity === 'medium')
        return chalk.yellow;
    return chalk.green;
}
function resolveMode(options) {
    if (options.base) {
        return { mode: 'base', baseRef: options.base };
    }
    if (options.staged) {
        return { mode: 'staged' };
    }
    if (options.head) {
        return { mode: 'head' };
    }
    return { mode: 'working' };
}
async function simulateCommand(options = {}) {
    try {
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const modeInput = resolveMode(options);
        const result = await (0, breakage_simulator_1.runBreakageSimulation)(cwd, {
            ...modeInput,
            maxImpacted: options.maxImpacted,
            maxDepth: options.depth,
        });
        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }
        console.log(chalk.bold.cyan('\n🔮 What Would Have Broken? Simulator\n'));
        console.log(chalk.dim(`Repo: ${result.repository.root}`));
        console.log(chalk.dim(`Branch: ${result.repository.branch}`));
        console.log(chalk.dim(`Head: ${result.repository.headSha}`));
        console.log(chalk.dim(`Mode: ${result.mode}${result.baseRef ? ` (${result.baseRef})` : ''}\n`));
        console.log(chalk.bold.white('Summary:'));
        console.log(chalk.cyan(`  • Changed files: ${result.summary.changedFiles}`));
        console.log(chalk.cyan(`  • Lines added/removed: +${result.summary.linesAdded} / -${result.summary.linesRemoved}`));
        console.log(chalk.cyan(`  • Impacted files (dependency graph): ${result.summary.impactedFiles}`));
        console.log(chalk.cyan(`  • Predicted regressions: ${result.summary.predictedRegressions}`));
        console.log(chalk.bold.white('\nPredicted Regressions:'));
        for (const regression of result.regressions) {
            const paint = severityColor(regression.severity);
            console.log(paint(`  • [${regression.severity.toUpperCase()} | ${(regression.confidence * 100).toFixed(0)}%] ${regression.title}`));
            console.log(chalk.dim(`    ${regression.reason}`));
            for (const evidence of regression.evidence.slice(0, 2)) {
                console.log(chalk.dim(`    - ${evidence}`));
            }
        }
        if (result.impacted.length > 0) {
            console.log(chalk.bold.white('\nTop Impacted Files:'));
            for (const file of result.impacted.slice(0, 12)) {
                console.log(chalk.dim(`  • ${file.path} (distance ${file.distance})`));
            }
        }
        if (result.recommendations.length > 0) {
            console.log(chalk.bold.white('\nRecommended Checks Before Merge:'));
            for (const recommendation of result.recommendations) {
                console.log(chalk.cyan(`  • ${recommendation}`));
            }
        }
        console.log(chalk.bold.white('\nCoverage:'));
        console.log(chalk.dim(`  • Dependency edges: ${result.coverage.dependencyEdges}`));
        console.log(chalk.dim(`  • Source files scanned: ${result.coverage.scannedFiles}`));
        console.log(chalk.dim(`  • Asset map source: ${result.coverage.usedPersistedAssetMap ? '.neurcode/asset-map.json' : 'fresh scan'}`));
        console.log('');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`\n❌ Simulator failed: ${message}`));
        process.exit(1);
    }
}
//# sourceMappingURL=simulate.js.map