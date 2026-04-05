"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.approveCommand = approveCommand;
const child_process_1 = require("child_process");
const manual_approvals_1 = require("../utils/manual-approvals");
const project_root_1 = require("../utils/project-root");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (str) => str,
        yellow: (str) => str,
        red: (str) => str,
        dim: (str) => str,
        bold: (str) => str,
        cyan: (str) => str,
    };
}
function resolveCommitSha(projectRoot, headOverride) {
    if (typeof headOverride === 'string' && headOverride.trim()) {
        return headOverride.trim().toLowerCase();
    }
    return (0, child_process_1.execSync)('git rev-parse HEAD', {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
    })
        .trim()
        .toLowerCase();
}
function resolveApprover(projectRoot, options) {
    if (options.approver && options.approver.trim()) {
        return options.approver.trim();
    }
    if (process.env.NEURCODE_APPROVER && process.env.NEURCODE_APPROVER.trim()) {
        return process.env.NEURCODE_APPROVER.trim();
    }
    try {
        const gitName = (0, child_process_1.execSync)('git config user.name', {
            cwd: projectRoot,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        if (gitName)
            return gitName;
    }
    catch {
        // Ignore git-config lookup failure.
    }
    if (process.env.USER && process.env.USER.trim()) {
        return process.env.USER.trim();
    }
    return 'unknown-approver';
}
function approveCommand(options) {
    const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const commitSha = resolveCommitSha(projectRoot, options.head);
    if (options.list) {
        const approvals = (0, manual_approvals_1.getManualApprovalsForCommit)(projectRoot, commitSha);
        const distinctApprovers = (0, manual_approvals_1.countDistinctApprovers)(approvals);
        if (options.json) {
            console.log(JSON.stringify({
                commitSha,
                approvals,
                total: approvals.length,
                distinctApprovers,
                storePath: (0, manual_approvals_1.getManualApprovalsPath)(projectRoot),
            }, null, 2));
            return;
        }
        console.log(chalk.cyan('\nManual Approvals'));
        console.log(chalk.dim(`Commit: ${commitSha}`));
        if (approvals.length === 0) {
            console.log(chalk.yellow('No approvals recorded for this commit.\n'));
            return;
        }
        approvals.forEach((item) => {
            const reason = item.reason ? ` — ${item.reason}` : '';
            console.log(chalk.dim(`• ${item.approver} @ ${item.approvedAt}${reason}`));
        });
        console.log(chalk.dim(`\nDistinct approvers: ${distinctApprovers}`));
        console.log(chalk.dim(`Store: ${(0, manual_approvals_1.getManualApprovalsPath)(projectRoot)}\n`));
        return;
    }
    const approver = resolveApprover(projectRoot, options);
    const approval = (0, manual_approvals_1.addManualApproval)(projectRoot, {
        commitSha,
        approver,
        planId: options.planId || null,
        reason: options.reason || null,
    });
    const approvals = (0, manual_approvals_1.getManualApprovalsForCommit)(projectRoot, commitSha);
    const distinctApprovers = (0, manual_approvals_1.countDistinctApprovers)(approvals);
    if (options.json) {
        console.log(JSON.stringify({
            success: true,
            approval,
            commitSha,
            distinctApprovers,
            totalApprovals: approvals.length,
            storePath: (0, manual_approvals_1.getManualApprovalsPath)(projectRoot),
        }, null, 2));
        return;
    }
    console.log(chalk.green('\n✅ Manual approval recorded'));
    console.log(chalk.dim(`   Commit: ${commitSha}`));
    console.log(chalk.dim(`   Approver: ${approval.approver}`));
    if (approval.reason) {
        console.log(chalk.dim(`   Reason: ${approval.reason}`));
    }
    console.log(chalk.dim(`   Distinct approvers for commit: ${distinctApprovers}`));
    console.log(chalk.dim(`   Store: ${(0, manual_approvals_1.getManualApprovalsPath)(projectRoot)}\n`));
}
//# sourceMappingURL=approve.js.map