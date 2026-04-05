"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customPolicyToRule = customPolicyToRule;
exports.mapActiveCustomPoliciesToRules = mapActiveCustomPoliciesToRules;
/**
 * Map a dashboard custom policy (natural language) to a policy-engine Rule.
 * Supports common patterns and falls back to a safe line-pattern rule.
 */
function customPolicyToRule(p) {
    const sev = p.severity === 'high' ? 'block' : 'warn';
    const text = p.rule_text.toLowerCase();
    if (text.includes('no console.log') || text.includes('console.log')) {
        return {
            id: `custom-${p.id}`,
            name: 'No console.log',
            description: p.rule_text,
            enabled: true,
            severity: sev,
            type: 'suspicious-keywords',
            keywords: ['console.log('],
        };
    }
    if (text.includes('no debugger') || /\bdebugger\b/.test(text)) {
        return {
            id: `custom-${p.id}`,
            name: 'No debugger',
            description: p.rule_text,
            enabled: true,
            severity: sev,
            type: 'suspicious-keywords',
            keywords: ['debugger'],
        };
    }
    if (text.includes('no eval') || /\beval\s*\(/.test(text)) {
        return {
            id: `custom-${p.id}`,
            name: 'No eval',
            description: p.rule_text,
            enabled: true,
            severity: sev,
            type: 'suspicious-keywords',
            keywords: ['eval('],
        };
    }
    // Fallback: line-pattern on added lines using a safe regex from the rule text.
    const quoted = /['"`]([^'"`]+)['"`]/.exec(p.rule_text);
    const phrase = quoted?.[1] ?? p.rule_text.replace(/^(no|don't|do not use|ban|avoid)\s+/i, '').trim().slice(0, 80);
    if (!phrase)
        return null;
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
        id: `custom-${p.id}`,
        name: `Custom: ${p.rule_text.slice(0, 50)}`,
        description: p.rule_text,
        enabled: true,
        severity: sev,
        type: 'line-pattern',
        pattern: escaped,
        matchType: 'added',
    };
}
function mapActiveCustomPoliciesToRules(policies) {
    const rules = [];
    for (const policy of policies) {
        const mapped = customPolicyToRule(policy);
        if (mapped)
            rules.push(mapped);
    }
    return rules;
}
//# sourceMappingURL=custom-policy-rules.js.map