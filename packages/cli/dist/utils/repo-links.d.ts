export interface RepoLinkEntry {
    alias: string;
    path: string;
    linkedAt: string;
}
export declare function canonicalizeRepoPath(pathValue: string): string;
export declare function getRepoLinksPath(projectRoot: string): string;
export declare function loadRepoLinks(projectRoot: string): RepoLinkEntry[];
export declare function saveRepoLinks(projectRoot: string, links: RepoLinkEntry[]): void;
export declare function upsertRepoLink(projectRoot: string, input: {
    path: string;
    alias?: string;
}): RepoLinkEntry;
export declare function removeRepoLink(projectRoot: string, aliasOrPath: string): RepoLinkEntry | null;
export declare function findRepoLink(projectRoot: string, aliasOrPath: string): RepoLinkEntry | null;
export declare function isRepoPathExplicitlyLinked(projectRoot: string, candidatePath: string): boolean;
//# sourceMappingURL=repo-links.d.ts.map