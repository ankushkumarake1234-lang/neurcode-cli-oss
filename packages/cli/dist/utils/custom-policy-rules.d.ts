import type { Rule } from '@neurcode-ai/policy-engine';
export interface ActiveCustomPolicy {
    id: string;
    user_id: string;
    rule_text: string;
    severity: 'low' | 'medium' | 'high';
    is_active: boolean;
    created_at: string;
    updated_at: string;
}
/**
 * Map a dashboard custom policy (natural language) to a policy-engine Rule.
 * Supports common patterns and falls back to a safe line-pattern rule.
 */
export declare function customPolicyToRule(p: {
    id: string;
    rule_text: string;
    severity: 'low' | 'medium' | 'high';
}): Rule | null;
export declare function mapActiveCustomPoliciesToRules(policies: ActiveCustomPolicy[]): Rule[];
//# sourceMappingURL=custom-policy-rules.d.ts.map