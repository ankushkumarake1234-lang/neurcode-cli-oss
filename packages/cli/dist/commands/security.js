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
exports.securityCommand = securityCommand;
const api_client_1 = require("../api-client");
const config_1 = require("../config");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function securityCommand(program) {
    program
        .command('security')
        .description('Analyze code for security vulnerabilities')
        .option('--diff <diff>', 'Git diff string to analyze')
        .option('--diff-file <file>', 'Path to file containing git diff')
        .option('--staged', 'Analyze staged changes (uses git diff --cached)')
        .option('--project-type <type>', 'Project type (e.g., "web", "api", "mobile")')
        .option('--json', 'Output results as JSON')
        .action(async (options) => {
        try {
            let diffText = '';
            // Get diff from various sources
            if (options.diff) {
                diffText = options.diff;
            }
            else if (options.diffFile) {
                const diffPath = path.resolve(options.diffFile);
                if (!fs.existsSync(diffPath)) {
                    console.error(`❌ Error: Diff file not found: ${diffPath}`);
                    process.exit(1);
                }
                diffText = fs.readFileSync(diffPath, 'utf-8');
            }
            else if (options.staged) {
                const { execSync } = require('child_process');
                try {
                    diffText = execSync('git diff --cached', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
                }
                catch (error) {
                    console.error('❌ Error: Not a git repository or no staged changes');
                    process.exit(1);
                }
            }
            else {
                // Try to get diff from git
                const { execSync } = require('child_process');
                try {
                    diffText = execSync('git diff HEAD', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
                    if (!diffText.trim()) {
                        console.error('❌ Error: No changes found. Use --staged for staged changes or provide --diff');
                        process.exit(1);
                    }
                }
                catch (error) {
                    console.error('❌ Error: Not a git repository. Please provide --diff or --diff-file');
                    process.exit(1);
                }
            }
            if (!diffText.trim()) {
                console.error('❌ Error: No diff content to analyze');
                process.exit(1);
            }
            // Initialize API client
            const config = (0, config_1.loadConfig)();
            const client = new api_client_1.ApiClient(config);
            if (!options.json) {
                console.log('\n🔒 Analyzing code for security vulnerabilities...');
            }
            // Call security analysis API
            const response = await client.analyzeSecurity(diffText, options.projectType);
            const { analysis } = response;
            if (options.json) {
                console.log(JSON.stringify(response, null, 2));
                process.exit(0);
            }
            // Display results
            console.log('\n🔒 Security Analysis Results:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            // Summary
            console.log(`\n📊 Summary:`);
            const severityColors = {
                CRITICAL: '🔴',
                HIGH: '🟠',
                MEDIUM: '🟡',
                LOW: '🟢',
            };
            console.log(`   ${severityColors.CRITICAL} Critical: ${analysis.summary.critical}`);
            console.log(`   ${severityColors.HIGH} High: ${analysis.summary.high}`);
            console.log(`   ${severityColors.MEDIUM} Medium: ${analysis.summary.medium}`);
            console.log(`   ${severityColors.LOW} Low: ${analysis.summary.low}`);
            console.log(`   Total Issues: ${analysis.summary.total}`);
            console.log(`\n⚠️  Overall Risk: ${severityColors[analysis.overallRisk] || '⚠️'} ${analysis.overallRisk}`);
            console.log(`   Recommendation: ${analysis.recommendation.toUpperCase()}`);
            // Issues
            if (analysis.issues.length > 0) {
                console.log(`\n🚨 Security Issues:`);
                analysis.issues.forEach((issue, i) => {
                    console.log(`\n   ${i + 1}. ${severityColors[issue.severity] || '⚠️'} ${issue.severity} - ${issue.type}`);
                    console.log(`      File: ${issue.file}`);
                    console.log(`      Lines: ${issue.lines[0]}-${issue.lines[1]}`);
                    console.log(`      Description: ${issue.description}`);
                    if (issue.exploitation) {
                        console.log(`      Exploitation: ${issue.exploitation}`);
                    }
                    if (issue.fix) {
                        console.log(`      Fix: ${issue.fix}`);
                    }
                    if (issue.cwe) {
                        console.log(`      CWE: ${issue.cwe}`);
                    }
                    console.log(`      Code:`);
                    const codeLines = (issue.code || '').split('\n');
                    console.log(`      ${codeLines.map((line) => `         ${line}`).join('\n')}`);
                });
            }
            else {
                console.log(`\n✅ No security issues found!`);
            }
            // Exit code based on recommendation
            if (analysis.recommendation === 'block') {
                process.exit(2);
            }
            else if (analysis.recommendation === 'warn') {
                process.exit(1);
            }
            else {
                process.exit(0);
            }
        }
        catch (error) {
            console.error('\n❌ Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
}
//# sourceMappingURL=security.js.map