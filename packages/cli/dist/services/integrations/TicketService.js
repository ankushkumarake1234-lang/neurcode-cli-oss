"use strict";
/**
 * Ticket Service - Contextual Intent Mapping
 *
 * Fetches business requirements from issue trackers (Linear, Jira, GitHub) to enrich user intents.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TicketService = void 0;
const child_process_1 = require("child_process");
/**
 * Ticket Service for fetching issue tracker data
 */
class TicketService {
    apiClient;
    constructor(apiClient) {
        this.apiClient = apiClient;
    }
    /**
     * Detect ticket format (Jira: PROJ-123, Linear: ABC-123)
     *
     * Note: Check Linear first (3-4 letters) before Jira (1+ letters)
     * because Linear pattern is more specific and would be incorrectly
     * classified as Jira if checked second.
     */
    detectTicketType(ticketId) {
        // Linear format: ABC-123, NEU-5 (3-4 letters, dash, numbers)
        // Check this FIRST because it's more specific
        if (/^[A-Z]{3,4}-\d+$/.test(ticketId)) {
            return 'linear';
        }
        // Jira format: PROJECT-123 (1+ uppercase letters, dash, numbers)
        // Check this SECOND because it's more general (matches longer project names)
        if (/^[A-Z]+-\d+$/.test(ticketId)) {
            return 'jira';
        }
        return 'unknown';
    }
    /**
     * Fetch ticket from Jira via backend API
     *
     * @param ticketId - Jira ticket ID (e.g., PROJ-123)
     * @returns Ticket metadata or null if fetch fails
     */
    async fetchFromJira(ticketId) {
        // TODO: Implement Jira backend integration (similar to Linear)
        // For now, throw error indicating Jira is not yet supported
        throw new Error('Jira integration is not yet implemented. Only Linear tickets are currently supported.');
    }
    /**
     * Fetch ticket from Linear via backend API
     *
     * @param ticketId - Linear issue ID (e.g., NEU-123)
     * @returns Ticket metadata or null if fetch fails
     */
    async fetchFromLinear(ticketId) {
        try {
            // Call backend API to fetch Linear ticket
            // Backend handles authentication and Linear API calls
            const apiUrl = this.apiClient['apiUrl']; // Access private property
            const url = `${apiUrl}/api/linear/ticket/${encodeURIComponent(ticketId)}`;
            const headers = {
                'Content-Type': 'application/json',
            };
            // Get API key from client
            const apiKey = this.apiClient['getApiKey']();
            const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
            headers['Authorization'] = key;
            const response = await fetch(url, {
                method: 'GET',
                headers,
            });
            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `Failed to fetch Linear ticket: ${response.status}`;
                try {
                    const errorJson = JSON.parse(errorText);
                    if (errorJson.message) {
                        errorMessage = errorJson.message;
                    }
                    // If Linear is not connected, provide helpful error
                    if (errorJson.error === 'Linear Not Connected') {
                        throw new Error('Linear is not connected. Please run: neurcode login\nThen visit https://neurcode.com/dashboard/integrations to connect Linear.');
                    }
                }
                catch (parseError) {
                    // If JSON parse fails, use original error message
                    if (parseError instanceof Error && parseError.message.includes('Linear is not connected')) {
                        throw parseError; // Re-throw our custom error
                    }
                }
                throw new Error(errorMessage);
            }
            const data = await response.json();
            return data.ticket;
        }
        catch (error) {
            // Re-throw with context
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(`Error fetching Linear ticket: ${String(error)}`);
        }
    }
    /**
     * Extract owner/repo from git remote origin URL
     */
    getGitHubOwnerRepo(cwd = process.cwd()) {
        try {
            const gitUrl = (0, child_process_1.execSync)('git remote get-url origin', {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'ignore'],
                cwd,
            }).trim();
            const match = gitUrl.match(/(?:github\.com)[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
            if (!match) {
                throw new Error('Could not parse GitHub owner/repo from git remote. Ensure origin points to a GitHub repo (e.g. https://github.com/owner/repo).');
            }
            return { owner: match[1], repo: match[2] };
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('Could not parse')) {
                throw error;
            }
            throw new Error('Not a git repo or no origin remote. Run this command from a git repository with a GitHub remote.');
        }
    }
    /**
     * Parse GitHub ref: "42", "owner/repo#42", or full URL
     */
    parseGitHubRef(id, cwd) {
        const trimmed = id.trim();
        // Full URL: https://github.com/owner/repo/issues/42 or /pull/101
        const urlMatch = trimmed.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/(?:issues|pull)\/(\d+)/i);
        if (urlMatch) {
            return { owner: urlMatch[1], repo: urlMatch[2], number: parseInt(urlMatch[3], 10) };
        }
        // owner/repo#42
        const refMatch = trimmed.match(/^([^/]+)\/([^/#]+)#(\d+)$/);
        if (refMatch) {
            return { owner: refMatch[1], repo: refMatch[2], number: parseInt(refMatch[3], 10) };
        }
        // Just a number - auto-detect repo from git
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num > 0) {
            const { owner, repo } = this.getGitHubOwnerRepo(cwd);
            return { owner, repo, number: num };
        }
        throw new Error(`Invalid GitHub ref: ${id}. Use a number (e.g. 42), owner/repo#42, or full GitHub URL.`);
    }
    /**
     * Fetch ticket from GitHub via backend API (issue or PR)
     */
    async fetchFromGitHub(id, type, cwd = process.cwd()) {
        const { owner, repo, number } = this.parseGitHubRef(id, cwd);
        const segment = type === 'issue' ? 'issue' : 'pr';
        const apiUrl = this.apiClient['apiUrl'];
        const url = `${apiUrl}/api/github/${segment}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${number}`;
        const headers = {
            'Content-Type': 'application/json',
        };
        const apiKey = this.apiClient['getApiKey']();
        const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
        headers['Authorization'] = key;
        const response = await fetch(url, { method: 'GET', headers });
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `Failed to fetch GitHub ${segment}: ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.message)
                    errorMessage = errorJson.message;
                if (errorJson.error === 'GitHub Not Connected') {
                    throw new Error('GitHub is not connected. Please run: neurcode login\nThen visit https://neurcode.com/dashboard/integrations to connect GitHub.');
                }
            }
            catch (parseError) {
                if (parseError instanceof Error && parseError.message.includes('GitHub is not connected')) {
                    throw parseError;
                }
            }
            throw new Error(errorMessage);
        }
        const data = (await response.json());
        return data.ticket;
    }
    /**
     * Fetch ticket from issue tracker
     *
     * @param ticketId - Ticket ID (e.g., PROJ-123 for Jira, ABC-123 for Linear)
     * @returns Ticket metadata
     * @throws Error if ticket cannot be fetched or format is unknown
     */
    async fetchTicket(ticketId) {
        const ticketType = this.detectTicketType(ticketId);
        if (ticketType === 'unknown') {
            throw new Error(`Unknown ticket format: ${ticketId}. Expected Jira format (PROJ-123) or Linear format (ABC-123)`);
        }
        let ticket;
        try {
            if (ticketType === 'jira') {
                ticket = await this.fetchFromJira(ticketId);
            }
            else {
                ticket = await this.fetchFromLinear(ticketId);
            }
            if (!ticket) {
                throw new Error(`Failed to fetch ticket ${ticketId} from ${ticketType}`);
            }
            return ticket;
        }
        catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(`Error fetching ticket ${ticketId}: ${String(error)}`);
        }
    }
    /**
     * Enrich user intent with ticket context
     *
     * @param intent - User's original intent
     * @param ticket - Ticket metadata
     * @returns Enriched intent string
     */
    enrichIntent(intent, ticket) {
        const parts = [];
        // Add ticket title
        parts.push(`Ticket: ${ticket.id} - ${ticket.title}`);
        // Add ticket description
        if (ticket.description) {
            parts.push(`\nDescription: ${ticket.description}`);
        }
        // Add acceptance criteria if available
        if (ticket.acceptanceCriteria) {
            parts.push(`\nAcceptance Criteria:\n${ticket.acceptanceCriteria}`);
        }
        // Add changed files (for GitHub PRs) - crucial context for the planner
        if (ticket.changedFiles && ticket.changedFiles.length > 0) {
            parts.push(`\nChanged Files (from PR):\n${ticket.changedFiles.map((f) => `- ${f}`).join('\n')}`);
        }
        // Add user's original intent
        parts.push(`\nUser Intent: ${intent}`);
        return parts.join('\n');
    }
    /**
     * Fetch ticket and enrich intent in one call
     *
     * @param ticketId - Ticket ID
     * @param intent - User's original intent
     * @returns Ticket context with enriched intent
     */
    async fetchTicketAndEnrich(ticketId, intent) {
        const ticket = await this.fetchTicket(ticketId);
        const enrichedIntent = this.enrichIntent(intent, ticket);
        return {
            ticket,
            enrichedIntent,
        };
    }
    /**
     * Fetch GitHub issue or PR and enrich intent
     *
     * @param id - Issue/PR number, owner/repo#N, or full GitHub URL
     * @param type - 'issue' or 'pr'
     * @param intent - User's original intent
     * @param cwd - Working directory for git remote detection (default: process.cwd())
     */
    async fetchGitHubTicketAndEnrich(id, type, intent, cwd = process.cwd()) {
        const ticket = await this.fetchFromGitHub(id, type, cwd);
        if (!ticket) {
            throw new Error(`Failed to fetch GitHub ${type} ${id}`);
        }
        const enrichedIntent = this.enrichIntent(intent, ticket);
        return { ticket, enrichedIntent };
    }
}
exports.TicketService = TicketService;
//# sourceMappingURL=TicketService.js.map