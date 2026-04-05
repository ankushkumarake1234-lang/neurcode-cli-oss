import type { GeneratePlanResponse } from '../api-client';
export interface ContextSource {
    path: string;
    label: string;
    bytes: number;
    truncated: boolean;
    kind: 'md' | 'json';
}
export interface LoadedStaticContext {
    text: string;
    hash: string;
    sources: ContextSource[];
}
export declare function getOrgProjectDir(cwd: string, orgId: string, projectId: string): string;
export declare function getOrgProjectMemoryPath(cwd: string, orgId: string, projectId: string): string;
export declare function getOrgProjectContextPath(cwd: string, orgId: string, projectId: string): string;
export declare function ensureDefaultLocalContextFile(cwd: string): void;
export declare function loadStaticNeurcodeContext(cwd: string, filter?: {
    orgId?: string;
    projectId?: string;
}): LoadedStaticContext;
export declare function loadOrgProjectMemoryTail(cwd: string, orgId: string, projectId: string): string;
export declare function appendPlanToOrgProjectMemory(cwd: string, orgId: string, projectId: string, intent: string, response: GeneratePlanResponse): void;
//# sourceMappingURL=neurcode-context.d.ts.map