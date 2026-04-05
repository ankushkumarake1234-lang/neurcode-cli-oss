import { ProjectMap } from '../services/mapper/ProjectScanner';
/**
 * Load existing asset map if it exists
 */
export declare function loadAssetMap(rootDir?: string): ProjectMap | null;
/**
 * Map command: Scan codebase and generate asset map
 */
export declare function mapCommand(rootDir?: string): Promise<void>;
//# sourceMappingURL=map.d.ts.map