"use strict";
/**
 * Init Command - Multi-Tenancy Project Linker
 *
 * Binds a local folder to a specific Organization + Project on the backend.
 *
 * Flow:
 * 1. Auth check - ensure user is logged in
 * 2. Fetch user's organizations via API
 * 3. Interactive org selection
 * 4. Link to existing project or create new
 * 5. Save .neurcode/config.json with orgId + projectId
 * 6. Success summary
 */
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
exports.initCommand = initCommand;
const path_1 = require("path");
const config_1 = require("../config");
const api_client_1 = require("../api-client");
const state_1 = require("../utils/state");
const readline = __importStar(require("readline"));
const messages_1 = require("../utils/messages");
// Import chalk with fallback
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
        blue: (str) => str,
        magenta: (str) => str,
        gray: (str) => str,
    };
}
/**
 * Get user input from terminal
 */
function promptUser(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}
/**
 * Display numbered options and get user selection
 */
async function selectOption(title, options) {
    console.log(chalk.bold.white(`\n${title}\n`));
    options.forEach((opt, index) => {
        console.log(chalk.cyan(`  ${index + 1}.`), chalk.white(opt.label));
    });
    console.log('');
    const answer = await promptUser(chalk.bold(`Select option (1-${options.length}): `));
    const choice = parseInt(answer, 10);
    if (choice >= 1 && choice <= options.length) {
        return options[choice - 1].value;
    }
    // Default to first option
    (0, messages_1.printWarning)('Invalid selection', `Defaulting to option 1: ${options[0].label}`);
    return options[0].value;
}
/**
 * Reset local state for re-linking
 */
function resetLocalState() {
    (0, state_1.saveState)({
        projectId: undefined,
        orgId: undefined,
        orgName: undefined,
        sessionId: undefined,
        activePlanId: undefined,
        lastPlanId: undefined,
        activeSessionId: undefined,
        lastPlanGeneratedAt: undefined,
    });
}
/**
 * Print a boxed summary (simple ASCII box, no external dep needed)
 */
function printBox(title, lines) {
    const maxLen = Math.max(title.length, ...lines.map(l => l.length)) + 4;
    const border = '═'.repeat(maxLen);
    console.log('');
    console.log(chalk.green(`╔${border}╗`));
    console.log(chalk.green(`║  ${chalk.bold.white(title.padEnd(maxLen - 2))}║`));
    console.log(chalk.green(`╠${border}╣`));
    lines.forEach(line => {
        console.log(chalk.green(`║  ${chalk.dim(line.padEnd(maxLen - 2))}║`));
    });
    console.log(chalk.green(`╚${border}╝`));
    console.log('');
}
async function initCommand(options) {
    try {
        let config = (0, config_1.loadConfig)();
        const requestedOrgId = options?.orgId?.trim();
        const requestedCreateName = options?.create?.trim() || undefined;
        const requestedProjectId = options?.projectId?.trim();
        const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
        const nonInteractiveMode = Boolean(requestedCreateName || requestedProjectId);
        if (requestedCreateName && requestedProjectId) {
            (0, messages_1.printError)('Conflicting options', 'Use either --create <name> or --project-id <id>, not both.');
            process.exit(1);
        }
        if (requestedOrgId && !isUuid(requestedOrgId)) {
            (0, messages_1.printError)('Invalid organization ID', `Expected internal UUID format. Got: ${requestedOrgId}`);
            process.exit(1);
        }
        if (requestedProjectId && !isUuid(requestedProjectId)) {
            (0, messages_1.printError)('Invalid project ID', `Expected internal UUID format. Got: ${requestedProjectId}`);
            process.exit(1);
        }
        // ─── Step 1: Auth Check ─────────────────────────────────────
        config.apiKey = process.env.NEURCODE_API_KEY || config.apiKey;
        const apiUrl = (config.apiUrl || config_1.DEFAULT_API_URL).replace(/\/$/, '');
        if (!config.apiKey) {
            if (process.stdout.isTTY && !process.env.CI) {
                (0, messages_1.printInfo)('Authentication Required', 'Please log in to initialize a project.');
                const { loginCommand } = await Promise.resolve().then(() => __importStar(require('./login')));
                await loginCommand();
                config = (0, config_1.loadConfig)();
                config.apiKey = process.env.NEURCODE_API_KEY || config.apiKey || (0, config_1.requireApiKey)();
            }
            else {
                config.apiKey = (0, config_1.requireApiKey)();
            }
        }
        config.apiUrl = apiUrl;
        const client = new api_client_1.ApiClient(config);
        const cwd = process.cwd();
        const dirName = (0, path_1.basename)(cwd);
        // Check if already linked
        const existingOrgId = (0, state_1.getOrgId)();
        const existingProjectId = (0, state_1.getProjectId)();
        if (existingOrgId && existingProjectId) {
            const existingOrgName = (0, state_1.getOrgName)() || existingOrgId;
            (0, messages_1.printInfo)('Already Linked', `This directory is linked to organization "${existingOrgName}".`);
            if (nonInteractiveMode) {
                (0, messages_1.printInfo)('Re-linking', 'Non-interactive init requested. Re-linking to requested project scope.');
                resetLocalState();
            }
            else {
                const action = await selectOption('What would you like to do?', [
                    { label: '✅ Keep current link', value: 'keep' },
                    { label: '🔄 Re-link to a different organization/project', value: 'relink' },
                    { label: '❌ Exit', value: 'exit' },
                ]);
                if (action === 'keep') {
                    printBox('Current Project Scope', [
                        `Organization: ${existingOrgName}`,
                        `Org ID:       ${existingOrgId}`,
                        `Project ID:   ${existingProjectId}`,
                    ]);
                    return;
                }
                else if (action === 'exit') {
                    (0, messages_1.printInfo)('No Changes', 'Project link unchanged.');
                    return;
                }
                // Re-link: reset state
                resetLocalState();
            }
        }
        // ─── Step 2: Fetch Organizations ────────────────────────────
        (0, messages_1.printSection)('Organization Discovery', '🏢');
        (0, messages_1.printInfo)('Fetching', 'Retrieving your organizations...');
        let organizations;
        try {
            organizations = await client.getUserOrganizations();
        }
        catch (error) {
            (0, messages_1.printError)('Could Not Fetch Organizations', error, [
                'Check your internet connection',
                'Verify authentication: neurcode doctor',
                'Try running: neurcode login',
            ]);
            process.exit(1);
            return; // TypeScript flow analysis
        }
        if (organizations.length === 0) {
            (0, messages_1.printError)('No Organizations Found', undefined, [
                'Create an organization at https://app.neurcode.com',
                'Or contact your admin to be added to one',
            ]);
            process.exit(1);
        }
        // ─── Step 3: Organization Selection ─────────────────────────
        let selectedOrg;
        if (requestedOrgId) {
            const matchedOrg = organizations.find((org) => org.id === requestedOrgId);
            if (!matchedOrg) {
                (0, messages_1.printError)('Organization not available', undefined, [
                    `The provided --org ID is not in your memberships: ${requestedOrgId}`,
                    'Run "neurcode init" without --org to choose interactively',
                    'Or run "neurcode whoami" to verify your current scope',
                ]);
                process.exit(1);
            }
            selectedOrg = matchedOrg;
            (0, messages_1.printSuccess)('Organization Selected', `${selectedOrg.name} (from --org)`);
        }
        else if (organizations.length === 1) {
            selectedOrg = organizations[0];
            const label = selectedOrg.isPersonal ? 'Personal' : 'Team';
            (0, messages_1.printSuccess)('Organization Found', `Auto-selected: ${selectedOrg.name} (${label})`);
        }
        else {
            if (nonInteractiveMode) {
                (0, messages_1.printError)('Organization selection required', undefined, [
                    'Multiple organizations are available.',
                    'Provide --org <id> when using non-interactive init flags.',
                ]);
                process.exit(1);
            }
            const orgOptions = organizations.map(org => ({
                label: `${org.isPersonal ? '👤' : '🏢'} ${org.name} (${org.isPersonal ? 'Personal' : 'Team'}) ${chalk.dim(`— ${org.role}`)}`,
                value: org,
            }));
            selectedOrg = await selectOption('🌐 Where should we deploy this project?', orgOptions);
        }
        // Ensure we use an API key scoped to the selected org before any project operations.
        // This avoids linking a folder to org B while creating/fetching projects in org A.
        let selectedOrgApiKey = process.env.NEURCODE_API_KEY || (0, config_1.getApiKey)(selectedOrg.id) || undefined;
        if (!selectedOrgApiKey && process.stdout.isTTY && !process.env.CI) {
            (0, messages_1.printInfo)('Organization Authentication Required', `You selected "${selectedOrg.name}". Authenticating this org now...`);
            const { loginCommand } = await Promise.resolve().then(() => __importStar(require('./login')));
            await loginCommand({ orgId: selectedOrg.id });
            selectedOrgApiKey = process.env.NEURCODE_API_KEY || (0, config_1.getApiKey)(selectedOrg.id) || undefined;
        }
        if (!selectedOrgApiKey) {
            (0, messages_1.printError)('Missing org-scoped API key', undefined, [
                `Run: neurcode login --org ${selectedOrg.id}`,
                'Then rerun: neurcode init',
            ]);
            process.exit(1);
        }
        const scopedClient = new api_client_1.ApiClient({
            ...config,
            apiKey: selectedOrgApiKey,
            orgId: selectedOrg.id,
        });
        // ─── Step 4: Project Setup ──────────────────────────────────
        (0, messages_1.printSection)('Project Setup', '📁');
        let project = null;
        let projectAction = null;
        if (requestedProjectId) {
            projectAction = 'existing';
        }
        else if (requestedCreateName) {
            projectAction = 'new';
        }
        else {
            projectAction = await selectOption('Link to existing project or create new?', [
                { label: '📂 Link to existing project', value: 'existing' },
                { label: '✨ Create new project', value: 'new' },
            ]);
        }
        if (projectAction === 'existing' && requestedProjectId) {
            (0, messages_1.printInfo)('Fetching Projects', `Looking up project ${requestedProjectId}...`);
            try {
                const projects = await scopedClient.getProjects();
                const matched = projects.find((p) => p.id === requestedProjectId);
                if (!matched) {
                    (0, messages_1.printError)('Project not available', undefined, [
                        `Project ID not found in "${selectedOrg.name}": ${requestedProjectId}`,
                        'Run "neurcode init" without --project-id to choose interactively.',
                    ]);
                    process.exit(1);
                }
                project = matched;
                (0, messages_1.printSuccess)('Project Selected', `${project.name} (from --project-id)`);
            }
            catch (error) {
                (0, messages_1.printError)('Could Not Fetch Projects', error, [
                    'Check your internet connection',
                    'Verify authentication: neurcode doctor',
                ]);
                process.exit(1);
            }
        }
        else if (projectAction === 'existing') {
            // Fetch existing projects
            (0, messages_1.printInfo)('Fetching Projects', 'Looking for existing projects...');
            try {
                const projects = await scopedClient.getProjects();
                if (projects.length === 0) {
                    (0, messages_1.printWarning)('No Projects Found', 'Creating a new project instead.');
                }
                else {
                    const projectOptions = projects.map(p => ({
                        label: `${p.name} ${p.git_url ? chalk.dim(`(${p.git_url})`) : ''}`,
                        value: p,
                    }));
                    project = await selectOption('Select a project:', projectOptions);
                }
            }
            catch (error) {
                (0, messages_1.printWarning)('Could Not Fetch Projects', 'Creating a new project instead.');
            }
        }
        if (!project) {
            // Create new project
            let name = requestedCreateName || '';
            if (!name) {
                const projectName = await promptUser(chalk.bold(`\n   Project name (default: ${dirName}): `));
                name = projectName || dirName;
            }
            (0, messages_1.printInfo)('Creating Project', `Setting up "${name}"...`);
            try {
                const newProject = await scopedClient.ensureProject('', name);
                project = {
                    id: newProject.id,
                    name: newProject.name,
                    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    git_url: null,
                };
            }
            catch (error) {
                (0, messages_1.printError)('Failed to Create Project', error, [
                    'Check your internet connection',
                    'Try again: neurcode init',
                ]);
                process.exit(1);
            }
        }
        // ─── Step 5: Save Local Config ──────────────────────────────
        (0, state_1.setProjectId)(project.id);
        (0, state_1.setOrgId)(selectedOrg.id, selectedOrg.name);
        // ─── Step 6: Success Summary ────────────────────────────────
        printBox(`✨ Linked to ${selectedOrg.name} / ${project.name}`, [
            `Organization: ${selectedOrg.name} (${selectedOrg.isPersonal ? 'Personal' : 'Team'})`,
            `Org ID:       ${selectedOrg.id}`,
            `Project:      ${project.name}`,
            `Project ID:   ${project.id}`,
            `Config:       .neurcode/config.json`,
            '',
            `All CLI commands in this directory will now`,
            `target this organization automatically.`,
        ]);
        (0, messages_1.printInfo)('Next Steps', 'Run: neurcode plan "<your intent>"');
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.message.includes('Authentication') || error.message.includes('401') || error.message.includes('403')) {
                await (0, messages_1.printAuthError)(error);
            }
            else {
                (0, messages_1.printError)('Initialization Failed', error, [
                    'Check your internet connection',
                    'Verify authentication: neurcode doctor',
                    'Try again: neurcode init',
                ]);
            }
        }
        else {
            (0, messages_1.printError)('Initialization Failed', String(error));
        }
        process.exit(1);
    }
}
//# sourceMappingURL=init.js.map