"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchCommand = watchCommand;
const Sentinel_1 = require("../services/watch/Sentinel");
const CommandPoller_1 = require("../services/watch/CommandPoller");
const state_1 = require("../utils/state");
const project_root_1 = require("../utils/project-root");
const messages_1 = require("../utils/messages");
/**
 * Watch command - Start the Neurcode Watch service
 *
 * Starts a background service that watches for file changes and records
 * them to support the "Time Machine" feature.
 */
async function watchCommand() {
    try {
        // Get project root (current working directory)
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        // Load state and get projectId
        const state = (0, state_1.loadState)();
        const projectId = (0, state_1.getProjectId)() || state.projectId;
        const orgId = (0, state_1.getOrgId)() || state.orgId || null;
        // Enforce project context: Require projectId to be set
        if (!projectId) {
            (0, messages_1.printError)('No Project Configured', undefined, [
                'Neurcode Watch requires a project to be set up',
                'Run: neurcode init',
                'This will create or connect to a project for this directory'
            ]);
            process.exit(1);
        }
        // Create and initialize Sentinel with scope context for live Brain indexing
        const sentinel = new Sentinel_1.Sentinel(projectRoot, projectId, orgId);
        await sentinel.initialize();
        // Create and start CommandPoller for remote commands
        const commandPoller = new CommandPoller_1.CommandPoller(projectRoot);
        commandPoller.start();
        // Start watching
        await sentinel.start();
        await (0, messages_1.printSuccessBanner)('Neurcode Watch Started', 'Your code changes are being tracked in real-time');
        // Check if cloud sync is configured
        const syncer = sentinel.getSyncer();
        if (syncer.isConfigured()) {
            (0, messages_1.printSuccess)('Cloud Sync Enabled', 'All events will be synced to your dashboard at dashboard.neurcode.com');
        }
        else {
            (0, messages_1.printWarning)('Cloud Sync Disabled', 'Run "neurcode config --key <your_api_key>" to enable cloud sync and access your history on the dashboard');
        }
        // Check if command polling is configured
        if (commandPoller.isConfigured()) {
            (0, messages_1.printInfo)('Remote Commands Enabled', 'You can execute revert and other commands from your dashboard');
        }
        else {
            (0, messages_1.printInfo)('Remote Commands Disabled', 'Configure an API key to enable remote command execution from the dashboard');
        }
        (0, messages_1.printInfo)('Watch Service', 'Press Ctrl+C to stop watching\n');
        if (!orgId) {
            (0, messages_1.printWarning)('Brain context indexing is partially scoped', 'No orgId found in local state. Run "neurcode init" so watch events are included in project memory.');
        }
        // Handle graceful shutdown
        const shutdown = async () => {
            (0, messages_1.printInfo)('Shutting down', 'Stopping watch service and syncing final changes...');
            commandPoller.stop();
            await sentinel.stop();
            (0, messages_1.printSuccess)('Watch service stopped', 'All changes have been synced. Goodbye!');
            process.exit(0);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
        // Keep the process alive
        // The watcher will keep the event loop alive
    }
    catch (error) {
        (0, messages_1.printError)('Failed to Start Watch Service', error instanceof Error ? error : String(error), [
            'Check if another watch process is running',
            'Verify project configuration: neurcode doctor',
            'Ensure you have write permissions in this directory',
            'Try: neurcode init (if project not configured)'
        ]);
        process.exit(1);
    }
}
//# sourceMappingURL=watch.js.map