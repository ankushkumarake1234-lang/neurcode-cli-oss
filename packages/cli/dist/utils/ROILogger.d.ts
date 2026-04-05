/**
 * ROI Logger
 *
 * Lightweight utility to send value events to the backend ROI service
 * Tracks: reverts, verify passes, secret interceptions, hallucination blocks
 */
export type ROIEventType = 'REVERT_SUCCESS' | 'VERIFY_PASS' | 'SECRET_INTERCEPTED' | 'HALLUCINATION_BLOCKED';
export interface ROIEventMetadata {
    [key: string]: any;
}
/**
 * Log a ROI event to the backend
 * This is fire-and-forget - errors are silently ignored to avoid blocking user workflows
 */
export declare function logROIEvent(eventType: ROIEventType, metadata?: ROIEventMetadata, projectId?: string | null): Promise<void>;
//# sourceMappingURL=ROILogger.d.ts.map