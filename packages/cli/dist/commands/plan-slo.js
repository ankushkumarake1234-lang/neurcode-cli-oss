"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planSloStatusCommand = planSloStatusCommand;
const path_1 = require("path");
const project_root_1 = require("../utils/project-root");
const plan_slo_1 = require("../utils/plan-slo");
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
function clampWindow(raw) {
    if (!Number.isFinite(raw || NaN)) {
        return 200;
    }
    return Math.min(5000, Math.max(1, Math.floor(raw)));
}
function percentile(values, ratio) {
    if (values.length === 0)
        return null;
    const boundedRatio = Math.max(0, Math.min(1, ratio));
    const sorted = [...values].sort((a, b) => a - b);
    const index = (sorted.length - 1) * boundedRatio;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) {
        return sorted[lower];
    }
    const weight = index - lower;
    return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}
function median(values) {
    return percentile(values, 0.5);
}
function rate(numerator, denominator) {
    if (denominator <= 0)
        return null;
    return numerator / denominator;
}
function formatNumber(value, digits = 0) {
    if (value === null || !Number.isFinite(value))
        return 'n/a';
    return value.toFixed(digits);
}
function formatPercent(value) {
    if (value === null || !Number.isFinite(value))
        return 'n/a';
    return `${(value * 100).toFixed(1)}%`;
}
function selectMetricEvents(events) {
    // Ignore aborted pre-flight runs with no coverage and no cache hit.
    return events.filter((event) => event.cached || event.coverageScore !== null);
}
function buildSummary(events) {
    const nonCachedEvents = events.filter((event) => !event.cached);
    const latencyValues = nonCachedEvents.map((event) => event.elapsedMs);
    const rssValues = nonCachedEvents
        .map((event) => event.rssKb)
        .filter((value) => Number.isFinite(value) && value > 0);
    const coverageValues = nonCachedEvents
        .map((event) => event.coverageScore)
        .filter((value) => typeof value === 'number' && Number.isFinite(value));
    const summary = {
        p95LatencyMs: percentile(latencyValues, 0.95),
        p95RssKb: percentile(rssValues, 0.95),
        successRate: rate(events.filter((event) => event.success && event.exitCode === 0).length, events.length),
        cacheHitRate: rate(events.filter((event) => event.cached).length, events.length),
        escalationTriggerRate: rate(nonCachedEvents.filter((event) => event.adaptiveEscalationTriggered).length, nonCachedEvents.length),
        escalationDeepenedRate: rate(nonCachedEvents.filter((event) => event.adaptiveEscalationDeepenedFiles > 0).length, nonCachedEvents.length),
        medianCoverageScore: median(coverageValues),
        p10CoverageScore: percentile(coverageValues, 0.1),
        p90CoverageScore: percentile(coverageValues, 0.9),
    };
    return { summary, nonCachedEvents };
}
function emitStatusJson(payload) {
    console.log(JSON.stringify(payload, null, 2));
}
function planSloStatusCommand(options = {}) {
    try {
        let projectRoot = (0, path_1.resolve)(process.cwd());
        try {
            projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        }
        catch {
            // Fallback to current working directory if root detection fails.
        }
        const allEvents = (0, plan_slo_1.readPlanSloEvents)(projectRoot);
        const windowSize = clampWindow(options.window);
        const recentEvents = allEvents.slice(Math.max(0, allEvents.length - windowSize));
        const metricEvents = selectMetricEvents(recentEvents);
        const { summary, nonCachedEvents } = buildSummary(metricEvents);
        const guardSnapshot = (0, plan_slo_1.readPlanEscalationGuardSnapshot)(projectRoot);
        const payload = {
            success: true,
            projectRoot,
            logPath: (0, plan_slo_1.getPlanSloLogPath)(projectRoot),
            totalEvents: allEvents.length,
            window: windowSize,
            consideredEvents: metricEvents.length,
            nonCachedEvents: nonCachedEvents.length,
            summary,
            killSwitch: {
                path: guardSnapshot.path,
                present: guardSnapshot.present,
                cooldownActive: guardSnapshot.cooldownActive,
                cooldownUntil: guardSnapshot.cooldownUntil,
                consecutiveBreaches: guardSnapshot.state?.consecutiveBreaches || 0,
                lastReason: guardSnapshot.state?.lastReason || null,
                updatedAt: guardSnapshot.state?.updatedAt || null,
            },
            message: metricEvents.length === 0
                ? 'No local plan SLO events yet. Run `neurcode plan` in this repository to collect metrics.'
                : undefined,
        };
        if (options.json) {
            emitStatusJson(payload);
            return;
        }
        console.log(chalk.bold.cyan('\n📈 Plan SLO Status\n'));
        console.log(chalk.white(`Repository: ${projectRoot}`));
        console.log(chalk.white(`Log file:   ${payload.logPath}`));
        console.log(chalk.white(`Events:     ${payload.totalEvents} total, ${metricEvents.length} considered in last ${windowSize}`));
        console.log(chalk.white(`Non-cached: ${payload.nonCachedEvents}`));
        if (payload.message) {
            console.log(chalk.yellow(`\n⚠️  ${payload.message}`));
        }
        console.log(chalk.bold.white('\nRuntime Summary:'));
        console.log(chalk.dim(`  p95 latency (non-cached): ${formatNumber(summary.p95LatencyMs)} ms`));
        console.log(chalk.dim(`  p95 RSS (non-cached): ${formatNumber(summary.p95RssKb)} KiB`));
        console.log(chalk.dim(`  success rate: ${formatPercent(summary.successRate)}`));
        console.log(chalk.dim(`  cache hit rate: ${formatPercent(summary.cacheHitRate)}`));
        console.log(chalk.dim(`  escalation trigger rate: ${formatPercent(summary.escalationTriggerRate)}`));
        console.log(chalk.dim(`  escalation deepened rate: ${formatPercent(summary.escalationDeepenedRate)}`));
        console.log(chalk.dim(`  coverage score (p10/median/p90): ${formatNumber(summary.p10CoverageScore, 1)} / ${formatNumber(summary.medianCoverageScore, 1)} / ${formatNumber(summary.p90CoverageScore, 1)}`));
        console.log(chalk.bold.white('\nKill Switch:'));
        if (!payload.killSwitch.present) {
            console.log(chalk.dim('  guard state file not found'));
        }
        else if (payload.killSwitch.cooldownActive) {
            console.log(chalk.yellow(`  ACTIVE until ${payload.killSwitch.cooldownUntil}`));
        }
        else {
            console.log(chalk.green('  inactive'));
        }
        console.log(chalk.dim(`  consecutive breaches: ${payload.killSwitch.consecutiveBreaches}`));
        if (payload.killSwitch.lastReason) {
            console.log(chalk.dim(`  last reason: ${payload.killSwitch.lastReason}`));
        }
        if (payload.killSwitch.updatedAt) {
            console.log(chalk.dim(`  updated at: ${payload.killSwitch.updatedAt}`));
        }
        console.log('');
    }
    catch (error) {
        if (options.json) {
            emitStatusJson({
                success: false,
                projectRoot: (0, path_1.resolve)(process.cwd()),
                logPath: (0, plan_slo_1.getPlanSloLogPath)((0, path_1.resolve)(process.cwd())),
                totalEvents: 0,
                window: clampWindow(options.window),
                consideredEvents: 0,
                nonCachedEvents: 0,
                summary: {
                    p95LatencyMs: null,
                    p95RssKb: null,
                    successRate: null,
                    cacheHitRate: null,
                    escalationTriggerRate: null,
                    escalationDeepenedRate: null,
                    medianCoverageScore: null,
                    p10CoverageScore: null,
                    p90CoverageScore: null,
                },
                killSwitch: {
                    path: '',
                    present: false,
                    cooldownActive: false,
                    cooldownUntil: null,
                    consecutiveBreaches: 0,
                    lastReason: null,
                    updatedAt: null,
                },
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
        else {
            console.error(chalk.red('\n❌ Error reading plan SLO status:'));
            console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        }
        process.exit(1);
    }
}
//# sourceMappingURL=plan-slo.js.map