"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditCommand = auditCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const api_client_1 = require("../api-client");
const config_1 = require("../config");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        bold: (str) => str,
        cyan: (str) => str,
        dim: (str) => str,
        green: (str) => str,
        red: (str) => str,
    };
}
function loadAuditRuntimeConfig() {
    const config = (0, config_1.loadConfig)();
    if (process.env.NEURCODE_API_KEY) {
        config.apiKey = process.env.NEURCODE_API_KEY;
    }
    if (process.env.NEURCODE_API_URL) {
        config.apiUrl = process.env.NEURCODE_API_URL.replace(/\/$/, '');
    }
    else if (config.apiUrl) {
        config.apiUrl = config.apiUrl.replace(/\/$/, '');
    }
    return config;
}
function toAbsoluteOutputPath(pathArg) {
    if ((0, path_1.isAbsolute)(pathArg))
        return pathArg;
    return (0, path_1.resolve)(process.cwd(), pathArg);
}
function validateIsoTimestamp(value, label) {
    if (!value)
        return;
    if (!Number.isFinite(Date.parse(value))) {
        throw new Error(`${label} must be a valid ISO timestamp`);
    }
}
function auditCommand(program) {
    const audit = program
        .command('audit')
        .description('Enterprise audit and compliance evidence operations');
    audit
        .command('evidence')
        .description('Export signed compliance evidence bundle for the active organization')
        .option('--include-events', 'Include raw audit events in the evidence payload (default)', true)
        .option('--no-include-events', 'Exclude raw audit events from the evidence payload')
        .option('--limit <n>', 'Maximum audit rows to scan (default: 2000)', (value) => parseInt(value, 10))
        .option('--action <action>', 'Filter to a specific audit action')
        .option('--actor-user-id <id>', 'Filter to a specific actor user ID')
        .option('--target-type <type>', 'Filter to a specific target type')
        .option('--from <iso>', 'Lower bound timestamp filter (ISO 8601)')
        .option('--to <iso>', 'Upper bound timestamp filter (ISO 8601)')
        .option('--out <path>', 'Write full evidence JSON to a file')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        try {
            validateIsoTimestamp(options.from, 'from');
            validateIsoTimestamp(options.to, 'to');
            if (options.from
                && options.to
                && Number.isFinite(Date.parse(options.from))
                && Number.isFinite(Date.parse(options.to))
                && Date.parse(options.from) > Date.parse(options.to)) {
                throw new Error('from must be earlier than or equal to to');
            }
            if (options.limit !== undefined
                && (!Number.isFinite(options.limit) || options.limit < 1 || options.limit > 10000)) {
                throw new Error('limit must be between 1 and 10000');
            }
            const config = loadAuditRuntimeConfig();
            const client = new api_client_1.ApiClient(config);
            const evidence = await client.getOrgAuditEvidenceBundle({
                includeEvents: options.includeEvents !== false,
                limit: Number.isFinite(options.limit) ? options.limit : undefined,
                action: options.action,
                actorUserId: options.actorUserId,
                targetType: options.targetType,
                from: options.from,
                to: options.to,
            });
            let outputPath = null;
            if (options.out) {
                outputPath = toAbsoluteOutputPath(options.out);
                (0, fs_1.mkdirSync)((0, path_1.dirname)(outputPath), { recursive: true });
                (0, fs_1.writeFileSync)(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf-8');
            }
            if (options.json) {
                console.log(JSON.stringify({
                    success: true,
                    outputPath,
                    evidence,
                }, null, 2));
                return;
            }
            console.log(chalk.bold.cyan('\n📦 Compliance Evidence Bundle\n'));
            console.log(chalk.dim(`Generated at: ${evidence.generatedAt}`));
            console.log(chalk.dim(`Organization: ${evidence.organizationId}`));
            console.log(chalk.dim(`Rows: ${evidence.summary.eventCount}${evidence.summary.truncated ? ' (truncated)' : ''}`));
            console.log(chalk.dim(`Integrity verified: ${evidence.integrity.verified ? 'yes' : 'no'}`));
            console.log(chalk.dim(`Signed: ${evidence.signature ? 'yes' : 'no'}`));
            console.log(chalk.dim(`Evidence hash: ${evidence.evidenceHash}`));
            if (evidence.signingKeyId) {
                console.log(chalk.dim(`Signing key ID: ${evidence.signingKeyId}`));
            }
            if (outputPath) {
                console.log(chalk.green(`\n✅ Evidence bundle written to ${outputPath}`));
            }
            else {
                console.log(chalk.dim('\nTip: pass --out ./neurcode-evidence.json to persist this artifact.'));
            }
            console.log('');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (options.json) {
                console.log(JSON.stringify({ success: false, error: message }, null, 2));
            }
            else {
                console.error(chalk.red(`\n❌ ${message}\n`));
            }
            process.exit(1);
        }
    });
}
//# sourceMappingURL=audit.js.map