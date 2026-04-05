/**
 * RelevanceScorer
 *
 * High-performance BM25-inspired keyword matching algorithm for filtering
 * exported tools based on user intent. Runs in milliseconds without requiring
 * vector databases or embeddings.
 */
import { ExportItem } from '../services/mapper/ProjectScanner';
/**
 * Get Top-K most relevant tools based on user intent
 *
 * @param intent - User's intent/query
 * @param exports - All available exports
 * @param k - Number of top results to return (default: 20)
 * @returns Filtered and sorted array of ExportItems
 */
export declare function getTopKTools(intent: string, exports: ExportItem[], k?: number): ExportItem[];
//# sourceMappingURL=RelevanceScorer.d.ts.map