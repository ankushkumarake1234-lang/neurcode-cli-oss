/**
 * Toolbox Service
 *
 * Provides smart, context-aware toolbox summary generation with Top-K
 * relevance filtering. This service is used by both `plan` and `prompt`
 * commands to ensure consistent, intelligent tool selection.
 */
import { ProjectMap } from './mapper/ProjectScanner';
/**
 * Generate a concise "Toolbox Summary" from the asset map
 * Uses Top-K relevance filtering to show only the most relevant tools
 *
 * @param map - Project map containing all global exports
 * @param intent - User's intent/query for relevance scoring
 * @returns Formatted toolbox summary string, or empty string if no exports
 */
export declare function generateToolboxSummary(map: ProjectMap, intent: string): string;
//# sourceMappingURL=toolbox-service.d.ts.map