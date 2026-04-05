/**
 * Project Knowledge Service
 *
 * Detects and maintains persistent knowledge about project tech stack and architecture.
 * This service provides context-aware information that helps the Architect make better decisions.
 *
 * Features:
 * - Tech stack detection (Node.js, Python, Go)
 * - Architecture pattern detection and memory
 * - Persistent storage in .neurcode/architecture.json
 * - Natural language project summaries
 */
import { z } from 'zod';
/**
 * Architecture pattern types
 */
export type ArchitecturePattern = 'monorepo' | 'nextjs-app' | 'layered' | 'modular' | 'feature-based' | 'mvc' | 'unknown';
/**
 * Architecture memory schema
 */
declare const ArchitectureMemorySchema: z.ZodObject<{
    pattern: z.ZodEnum<{
        unknown: "unknown";
        monorepo: "monorepo";
        "nextjs-app": "nextjs-app";
        layered: "layered";
        modular: "modular";
        "feature-based": "feature-based";
        mvc: "mvc";
    }>;
    invariants: z.ZodArray<z.ZodString>;
    domainBoundaries: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type ArchitectureMemory = z.infer<typeof ArchitectureMemorySchema>;
/**
 * Tech stack information
 */
export interface TechStack {
    language: 'typescript' | 'javascript' | 'python' | 'go' | 'unknown';
    framework?: string;
    orm?: string;
    styling?: string;
    buildTool?: string;
    packageManager?: string;
    version?: string;
}
/**
 * Project summary combining tech stack and architecture
 */
export interface ProjectSummary {
    techStack: TechStack;
    architecture: ArchitectureMemory;
    summary: string;
}
export declare class ProjectKnowledgeService {
    /**
     * Detect tech stack from project root
     */
    detectTechStack(rootPath: string): Promise<TechStack>;
    /**
     * Detect Node.js framework from package.json
     * Returns lowercase framework names: next, react, express, nest, fastify, django, flask
     */
    private detectNodeFramework;
    /**
     * Detect Node.js ORM from package.json
     * Returns lowercase ORM names: prisma, typeorm, mongoose, sequelize
     */
    private detectNodeORM;
    /**
     * Detect styling library from package.json
     */
    private detectStyling;
    /**
     * Detect build tool from package.json
     */
    private detectBuildTool;
    /**
     * Detect package manager from lock files
     */
    private detectPackageManager;
    /**
     * Detect Python framework from requirements.txt
     * Returns lowercase framework names: django, flask
     */
    private detectPythonFramework;
    /**
     * Detect Python ORM from requirements.txt
     */
    private detectPythonORM;
    /**
     * Detect Go framework from go.mod
     */
    private detectGoFramework;
    /**
     * Detect Go ORM from go.mod
     */
    private detectGoORM;
    /**
     * Detect architecture pattern from folder structure
     * Priority: monorepo > nextjs-app > layered > modular > feature-based > mvc > unknown
     */
    private detectArchitecturePattern;
    /**
     * Detect domain boundaries from folder structure
     */
    private detectDomainBoundaries;
    /**
     * Generate default invariants based on architecture pattern
     */
    private generateDefaultInvariants;
    /**
     * Read architecture memory from .neurcode/architecture.json
     */
    readArchitectureMemory(rootPath: string): Promise<ArchitectureMemory | null>;
    /**
     * Write architecture memory to .neurcode/architecture.json
     */
    writeArchitectureMemory(rootPath: string, memory: ArchitectureMemory): Promise<void>;
    /**
     * Initialize architecture memory with defaults based on folder structure
     */
    initializeArchitectureMemory(rootPath: string): Promise<ArchitectureMemory>;
    /**
     * Get or create architecture memory (reads from disk or initializes)
     * Implements Read-Through Caching: if file doesn't exist, detect and save immediately
     */
    getArchitectureMemory(rootPath: string): Promise<ArchitectureMemory>;
    /**
     * Generate natural language project summary
     */
    getProjectSummary(rootPath: string): Promise<ProjectSummary>;
}
export {};
//# sourceMappingURL=project-knowledge-service.d.ts.map