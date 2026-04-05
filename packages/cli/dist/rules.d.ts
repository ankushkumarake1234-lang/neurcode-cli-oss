/**
 * Re-export types and functions from policy engine
 * This maintains backward compatibility while using the shared package
 */
import { DiffFile } from '@neurcode-ai/diff-parser';
import { type RuleResult } from '@neurcode-ai/policy-engine';
export { type RuleViolation, type RuleResult, type Decision, type Severity, createDefaultPolicy, defaultRules, } from '@neurcode-ai/policy-engine';
/**
 * Evaluate rules using default policy
 * This maintains backward compatibility with existing CLI code
 */
export declare function evaluateRules(diffFiles: DiffFile[]): RuleResult;
//# sourceMappingURL=rules.d.ts.map