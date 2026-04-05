/**
 * Ticket Service - Contextual Intent Mapping
 *
 * Fetches business requirements from issue trackers (Linear, Jira, GitHub) to enrich user intents.
 */
import { ApiClient } from '../../api-client';
export interface TicketMetadata {
    id: string;
    title: string;
    description: string;
    acceptanceCriteria?: string;
    labels?: string[];
    status?: string;
    priority?: string | number;
    url?: string;
    /** For GitHub PRs: list of file paths changed in the PR */
    changedFiles?: string[];
}
export interface TicketContext {
    ticket: TicketMetadata;
    enrichedIntent: string;
}
/**
 * Ticket Service for fetching issue tracker data
 */
export declare class TicketService {
    private apiClient;
    constructor(apiClient: ApiClient);
    /**
     * Detect ticket format (Jira: PROJ-123, Linear: ABC-123)
     *
     * Note: Check Linear first (3-4 letters) before Jira (1+ letters)
     * because Linear pattern is more specific and would be incorrectly
     * classified as Jira if checked second.
     */
    private detectTicketType;
    /**
     * Fetch ticket from Jira via backend API
     *
     * @param ticketId - Jira ticket ID (e.g., PROJ-123)
     * @returns Ticket metadata or null if fetch fails
     */
    private fetchFromJira;
    /**
     * Fetch ticket from Linear via backend API
     *
     * @param ticketId - Linear issue ID (e.g., NEU-123)
     * @returns Ticket metadata or null if fetch fails
     */
    private fetchFromLinear;
    /**
     * Extract owner/repo from git remote origin URL
     */
    private getGitHubOwnerRepo;
    /**
     * Parse GitHub ref: "42", "owner/repo#42", or full URL
     */
    private parseGitHubRef;
    /**
     * Fetch ticket from GitHub via backend API (issue or PR)
     */
    private fetchFromGitHub;
    /**
     * Fetch ticket from issue tracker
     *
     * @param ticketId - Ticket ID (e.g., PROJ-123 for Jira, ABC-123 for Linear)
     * @returns Ticket metadata
     * @throws Error if ticket cannot be fetched or format is unknown
     */
    fetchTicket(ticketId: string): Promise<TicketMetadata>;
    /**
     * Enrich user intent with ticket context
     *
     * @param intent - User's original intent
     * @param ticket - Ticket metadata
     * @returns Enriched intent string
     */
    enrichIntent(intent: string, ticket: TicketMetadata): string;
    /**
     * Fetch ticket and enrich intent in one call
     *
     * @param ticketId - Ticket ID
     * @param intent - User's original intent
     * @returns Ticket context with enriched intent
     */
    fetchTicketAndEnrich(ticketId: string, intent: string): Promise<TicketContext>;
    /**
     * Fetch GitHub issue or PR and enrich intent
     *
     * @param id - Issue/PR number, owner/repo#N, or full GitHub URL
     * @param type - 'issue' or 'pr'
     * @param intent - User's original intent
     * @param cwd - Working directory for git remote detection (default: process.cwd())
     */
    fetchGitHubTicketAndEnrich(id: string, type: 'issue' | 'pr', intent: string, cwd?: string): Promise<TicketContext>;
}
//# sourceMappingURL=TicketService.d.ts.map