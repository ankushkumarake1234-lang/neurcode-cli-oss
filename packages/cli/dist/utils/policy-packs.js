"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPolicyPacks = listPolicyPacks;
exports.getPolicyPack = getPolicyPack;
exports.readInstalledPolicyPack = readInstalledPolicyPack;
exports.installPolicyPack = installPolicyPack;
exports.uninstallPolicyPack = uninstallPolicyPack;
exports.getInstalledPolicyPackRules = getInstalledPolicyPackRules;
exports.getPolicyLockPath = getPolicyLockPath;
exports.readPolicyLockFile = readPolicyLockFile;
exports.writePolicyLockFile = writePolicyLockFile;
exports.buildPolicyStateSnapshot = buildPolicyStateSnapshot;
exports.comparePolicyStateToLock = comparePolicyStateToLock;
exports.evaluatePolicyLock = evaluatePolicyLock;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const policy_engine_1 = require("@neurcode-ai/policy-engine");
const ACTIVE_PACK_PATH = ['.neurcode', 'policies', 'policy-pack.active.json'];
const POLICY_LOCK_FILENAME = 'neurcode.policy.lock.json';
function withPackPrefix(packId, rules) {
    return rules.map((rule) => ({
        ...rule,
        id: `pack:${packId}:${rule.id}`,
        name: `${rule.name} [${packId}]`,
        description: rule.description
            ? `${rule.description} (policy pack: ${packId})`
            : `Policy pack (${packId}) rule`,
    }));
}
const POLICY_PACKS = {
    fintech: {
        id: 'fintech',
        name: 'Fintech Guardrails',
        description: 'Strict controls for payments, ledgers, secrets, and migration safety.',
        version: '1.0.0',
        tags: ['fintech', 'payments', 'risk'],
        rules: withPackPrefix('fintech', [
            {
                id: 'payments-sensitive-files',
                name: 'Protect payment and ledger modules',
                enabled: true,
                severity: 'block',
                type: 'sensitive-file',
                patterns: [
                    'payments?',
                    'ledger',
                    'settlement',
                    'reconciliation',
                ],
            },
            {
                id: 'prod-secret-hardening',
                name: 'Block production-like credential leakage',
                enabled: true,
                severity: 'block',
                type: 'potential-secret',
                patterns: [
                    'sk_live_[A-Za-z0-9]+',
                    'rk_live_[A-Za-z0-9]+',
                    'BEGIN (RSA|EC|OPENSSH) PRIVATE KEY',
                    '(api[_-]?key|secret|token|password)\\s*[:=]\\s*["\'][^"\']{8,}["\']',
                ],
            },
            {
                id: 'large-migration-warning',
                name: 'Warn on large schema migration',
                enabled: true,
                severity: 'warn',
                type: 'large-migration',
                threshold: 150,
                migrationPatterns: ['migrations?.*\\.(sql|ts|js)$', 'prisma/.*\\.sql$'],
            },
            {
                id: 'dangerous-payment-bypass',
                name: 'Block payment bypass keywords',
                enabled: true,
                severity: 'block',
                type: 'line-pattern',
                pattern: '\\b(skipKyc|disableFraudCheck|allowNegativeBalance|bypassRiskCheck)\\b',
                matchType: 'added',
            },
        ]),
    },
    hipaa: {
        id: 'hipaa',
        name: 'HIPAA Baseline',
        description: 'PII/PHI oriented governance pack for healthcare-adjacent systems.',
        version: '1.0.0',
        tags: ['hipaa', 'privacy', 'healthcare'],
        rules: withPackPrefix('hipaa', [
            {
                id: 'phi-keyword-guard',
                name: 'Detect PHI-related keywords',
                enabled: true,
                severity: 'block',
                type: 'suspicious-keywords',
                keywords: ['ssn', 'social security', 'medical_record', 'patient_id', 'diagnosis', 'phi'],
            },
            {
                id: 'no-console-pii',
                name: 'Block console logging in PHI-sensitive changes',
                enabled: true,
                severity: 'block',
                type: 'line-pattern',
                pattern: '\\bconsole\\.log\\s*\\(',
                matchType: 'added',
            },
            {
                id: 'privacy-audit-sensitive-files',
                name: 'Protect privacy and audit modules',
                enabled: true,
                severity: 'block',
                type: 'sensitive-file',
                patterns: ['privacy', 'audit', 'consent', 'compliance'],
            },
            {
                id: 'encryption-downgrade-warning',
                name: 'Warn on encryption bypass patterns',
                enabled: true,
                severity: 'warn',
                type: 'line-pattern',
                pattern: '\\b(disableEncryption|skipEncryption|plaintext)\\b',
                matchType: 'added',
            },
        ]),
    },
    soc2: {
        id: 'soc2',
        name: 'SOC2 Readiness',
        description: 'Governance controls focused on auth, CI integrity, and operational safety.',
        version: '1.0.0',
        tags: ['soc2', 'controls', 'audit'],
        rules: withPackPrefix('soc2', [
            {
                id: 'auth-bypass-block',
                name: 'Block authentication bypass patterns',
                enabled: true,
                severity: 'block',
                type: 'line-pattern',
                pattern: '\\b(skipAuth|disableAuth|allowAll|bypassAuth)\\b',
                matchType: 'added',
            },
            {
                id: 'workflow-protection',
                name: 'Protect CI workflow definitions',
                enabled: true,
                severity: 'warn',
                type: 'sensitive-file',
                patterns: ['^\\.github/workflows/', 'ci', 'pipeline'],
            },
            {
                id: 'operational-secret-protection',
                name: 'Block operational secrets',
                enabled: true,
                severity: 'block',
                type: 'potential-secret',
                patterns: [
                    'AKIA[0-9A-Z]{16}',
                    'aws_secret_access_key',
                    'private[_-]?key',
                    'bearer\\s+[A-Za-z0-9._-]{16,}',
                ],
            },
            {
                id: 'large-change-governance',
                name: 'Warn on very large changesets',
                enabled: true,
                severity: 'warn',
                type: 'large-change',
                threshold: 700,
            },
        ]),
    },
    'startup-fast': {
        id: 'startup-fast',
        name: 'Startup Fast Guardrails',
        description: 'Lightweight pragmatic pack: catch sharp edges while preserving velocity.',
        version: '1.0.0',
        tags: ['startup', 'velocity', 'pragmatic'],
        rules: withPackPrefix('startup-fast', [
            {
                id: 'debugger-and-eval',
                name: 'Warn on debugger/eval',
                enabled: true,
                severity: 'warn',
                type: 'suspicious-keywords',
                keywords: ['debugger', 'eval(', 'child_process.exec('],
            },
            {
                id: 'basic-secret-guard',
                name: 'Block obvious secrets',
                enabled: true,
                severity: 'block',
                type: 'potential-secret',
                patterns: [
                    '(api[_-]?key|token|password|secret)\\s*[:=]\\s*["\'][^"\']{8,}["\']',
                    'BEGIN (RSA|EC|OPENSSH) PRIVATE KEY',
                ],
            },
            {
                id: 'large-change-soft-cap',
                name: 'Warn on very large PRs',
                enabled: true,
                severity: 'warn',
                type: 'large-change',
                threshold: 900,
            },
        ]),
    },
    node: {
        id: 'node',
        name: 'Node Service Baseline',
        description: 'Baseline guardrails for Node.js backends and APIs.',
        version: '1.0.0',
        tags: ['node', 'backend', 'api'],
        rules: withPackPrefix('node', [
            {
                id: 'env-and-secrets-protection',
                name: 'Block env secret leakage',
                enabled: true,
                severity: 'block',
                type: 'potential-secret',
                patterns: [
                    '(api[_-]?key|token|password|secret)\\s*[:=]\\s*["\'][^"\']{8,}["\']',
                    'mongodb\\+srv://[^\\s]+',
                    'postgres(ql)?:\\/\\/[^\\s]+',
                ],
            },
            {
                id: 'unsafe-child-process',
                name: 'Warn on unsafe shell execution',
                enabled: true,
                severity: 'warn',
                type: 'line-pattern',
                pattern: '\\b(child_process\\.(exec|execSync)|shell\\s*:\\s*true)\\b',
                matchType: 'added',
            },
            {
                id: 'auth-route-protection',
                name: 'Protect auth and middleware files',
                enabled: true,
                severity: 'warn',
                type: 'sensitive-file',
                patterns: ['auth', 'middleware', 'permissions?', 'rbac'],
            },
            {
                id: 'large-api-change-warning',
                name: 'Warn on very large backend changes',
                enabled: true,
                severity: 'warn',
                type: 'large-change',
                threshold: 650,
            },
        ]),
    },
    python: {
        id: 'python',
        name: 'Python Service Baseline',
        description: 'Guardrails for Python apps and ML-adjacent services.',
        version: '1.0.0',
        tags: ['python', 'backend', 'ml'],
        rules: withPackPrefix('python', [
            {
                id: 'dotenv-and-credential-leak',
                name: 'Block common credential leaks',
                enabled: true,
                severity: 'block',
                type: 'potential-secret',
                patterns: [
                    '(api[_-]?key|token|password|secret)\\s*=\\s*["\'][^"\']{8,}["\']',
                    'aws_access_key_id',
                    'aws_secret_access_key',
                    'OPENAI_API_KEY',
                ],
            },
            {
                id: 'dangerous-runtime-eval',
                name: 'Warn on eval/exec usage',
                enabled: true,
                severity: 'warn',
                type: 'suspicious-keywords',
                keywords: ['eval(', 'exec(', 'subprocess.Popen(', 'pickle.loads('],
            },
            {
                id: 'requirements-and-build-protection',
                name: 'Protect dependency lock surfaces',
                enabled: true,
                severity: 'warn',
                type: 'sensitive-file',
                patterns: ['requirements', 'poetry.lock', 'pyproject.toml', 'setup.py'],
            },
            {
                id: 'migration-and-schema-alert',
                name: 'Warn on large migration/schema edits',
                enabled: true,
                severity: 'warn',
                type: 'large-migration',
                threshold: 140,
                migrationPatterns: ['migrations?.*\\.(sql|py)$', 'alembic/.*\\.py$'],
            },
        ]),
    },
    java: {
        id: 'java',
        name: 'Java Service Baseline',
        description: 'Guardrails for Java/Spring enterprise services.',
        version: '1.0.0',
        tags: ['java', 'spring', 'backend'],
        rules: withPackPrefix('java', [
            {
                id: 'credential-patterns',
                name: 'Block credentials in code',
                enabled: true,
                severity: 'block',
                type: 'potential-secret',
                patterns: [
                    '(api[_-]?key|token|password|secret)\\s*[=:]\\s*["\'][^"\']{8,}["\']',
                    'jdbc:[^\\s]+',
                    'BEGIN (RSA|EC|OPENSSH) PRIVATE KEY',
                ],
            },
            {
                id: 'auth-annotation-bypass',
                name: 'Warn on auth bypass patterns',
                enabled: true,
                severity: 'warn',
                type: 'line-pattern',
                pattern: '\\b(permitAll\\(|@PermitAll|disableCsrf\\(|setAllowCredentials\\(true\\))\\b',
                matchType: 'added',
            },
            {
                id: 'security-config-sensitive',
                name: 'Protect security configuration files',
                enabled: true,
                severity: 'warn',
                type: 'sensitive-file',
                patterns: ['SecurityConfig', 'WebSecurity', 'application\\.ya?ml', 'application\\.properties'],
            },
            {
                id: 'oversized-service-warning',
                name: 'Warn on oversized enterprise diffs',
                enabled: true,
                severity: 'warn',
                type: 'large-change',
                threshold: 750,
            },
        ]),
    },
    frontend: {
        id: 'frontend',
        name: 'Frontend Web Baseline',
        description: 'Guardrails for React/Next/Vite-style frontend applications.',
        version: '1.0.0',
        tags: ['frontend', 'react', 'web'],
        rules: withPackPrefix('frontend', [
            {
                id: 'client-secret-leak',
                name: 'Block client-side secret leakage',
                enabled: true,
                severity: 'block',
                type: 'potential-secret',
                patterns: [
                    '(api[_-]?key|token|password|secret)\\s*[:=]\\s*["\'][^"\']{8,}["\']',
                    'NEXT_PUBLIC_[A-Z0-9_]*SECRET',
                    'VITE_[A-Z0-9_]*SECRET',
                ],
            },
            {
                id: 'unsafe-dom-injection',
                name: 'Warn on unsafe DOM insertion patterns',
                enabled: true,
                severity: 'warn',
                type: 'line-pattern',
                pattern: '\\b(dangerouslySetInnerHTML|innerHTML\\s*=|document\\.write\\()\\b',
                matchType: 'added',
            },
            {
                id: 'routing-auth-boundaries',
                name: 'Protect auth and routing boundaries',
                enabled: true,
                severity: 'warn',
                type: 'sensitive-file',
                patterns: ['middleware', 'auth', 'route', 'guard', 'session'],
            },
            {
                id: 'ui-diff-size-warning',
                name: 'Warn on oversized UI diffs',
                enabled: true,
                severity: 'warn',
                type: 'large-change',
                threshold: 800,
            },
        ]),
    },
};
function listPolicyPacks() {
    return Object.values(POLICY_PACKS);
}
function getPolicyPack(packId) {
    if (packId in POLICY_PACKS) {
        return POLICY_PACKS[packId];
    }
    return null;
}
function getActivePackPath(cwd) {
    return (0, path_1.join)(cwd, ...ACTIVE_PACK_PATH);
}
function ensurePolicyDir(cwd) {
    const dir = (0, path_1.join)(cwd, '.neurcode', 'policies');
    if (!(0, fs_1.existsSync)(dir)) {
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    }
}
function readInstalledPolicyPack(cwd) {
    const path = getActivePackPath(cwd);
    if (!(0, fs_1.existsSync)(path))
        return null;
    try {
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.rules)) {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
function installPolicyPack(cwd, packId, force = false) {
    const pack = getPolicyPack(packId);
    if (!pack) {
        throw new Error(`Unknown policy pack: ${packId}`);
    }
    const existing = readInstalledPolicyPack(cwd);
    if (existing && !force) {
        throw new Error(`Policy pack already installed: ${existing.packId}. Re-run with --force to replace it.`);
    }
    ensurePolicyDir(cwd);
    const installed = {
        schemaVersion: 1,
        packId: pack.id,
        packName: pack.name,
        version: pack.version,
        installedAt: new Date().toISOString(),
        tags: [...pack.tags],
        rules: pack.rules,
    };
    (0, fs_1.writeFileSync)(getActivePackPath(cwd), JSON.stringify(installed, null, 2) + '\n', 'utf-8');
    return installed;
}
function uninstallPolicyPack(cwd) {
    const path = getActivePackPath(cwd);
    if (!(0, fs_1.existsSync)(path))
        return false;
    (0, fs_1.rmSync)(path, { force: true });
    return true;
}
function getInstalledPolicyPackRules(cwd) {
    const installed = readInstalledPolicyPack(cwd);
    if (!installed)
        return null;
    return {
        packId: installed.packId,
        packName: installed.packName,
        version: installed.version,
        rules: installed.rules,
    };
}
function sha256Hex(input) {
    return (0, crypto_1.createHash)('sha256').update(input, 'utf-8').digest('hex');
}
function normalizeForHash(value) {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => normalizeForHash(item));
    }
    const record = value;
    const out = {};
    for (const key of Object.keys(record).sort()) {
        const current = record[key];
        if (typeof current === 'undefined')
            continue;
        out[key] = normalizeForHash(current);
    }
    return out;
}
function fingerprintJson(value) {
    return sha256Hex(JSON.stringify(normalizeForHash(value)));
}
function normalizedRuleId(value) {
    if (!value || typeof value !== 'object') {
        return '';
    }
    const id = value.id;
    return typeof id === 'string' ? id : '';
}
function fingerprintRules(rules) {
    const normalized = rules
        .map((rule) => normalizeForHash(rule))
        .sort((left, right) => {
        const leftId = normalizedRuleId(left);
        const rightId = normalizedRuleId(right);
        if (leftId !== rightId) {
            return leftId.localeCompare(rightId);
        }
        return JSON.stringify(left).localeCompare(JSON.stringify(right));
    });
    return fingerprintJson(normalized);
}
function buildCustomPolicyRefs(customPolicies) {
    const refs = customPolicies.map((policy) => ({
        id: policy.id,
        severity: policy.severity,
        updatedAt: policy.updated_at,
        ruleTextHash: sha256Hex(policy.rule_text.trim()),
    }));
    refs.sort((left, right) => {
        if (left.id !== right.id) {
            return left.id.localeCompare(right.id);
        }
        return left.updatedAt.localeCompare(right.updatedAt);
    });
    return refs;
}
function getPolicyLockPath(cwd) {
    return (0, path_1.join)(cwd, POLICY_LOCK_FILENAME);
}
function isPolicyLockFileShape(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const record = value;
    if (record.schemaVersion !== 1 || typeof record.generatedAt !== 'string') {
        return false;
    }
    const defaultRules = record.defaultRules;
    if (!defaultRules ||
        typeof defaultRules.count !== 'number' ||
        typeof defaultRules.fingerprint !== 'string') {
        return false;
    }
    const customPolicies = record.customPolicies;
    if (!customPolicies) {
        return false;
    }
    if ((customPolicies.mode !== 'dashboard' && customPolicies.mode !== 'disabled') ||
        typeof customPolicies.count !== 'number' ||
        typeof customPolicies.fingerprint !== 'string' ||
        typeof customPolicies.mappedRuleCount !== 'number' ||
        typeof customPolicies.mappedRulesFingerprint !== 'string' ||
        !Array.isArray(customPolicies.refs)) {
        return false;
    }
    const effective = record.effective;
    if (!effective || typeof effective.ruleCount !== 'number' || typeof effective.fingerprint !== 'string') {
        return false;
    }
    const pack = record.policyPack;
    if (pack === null) {
        return true;
    }
    if (!pack || typeof pack !== 'object') {
        return false;
    }
    const policyPack = pack;
    return (typeof policyPack.id === 'string' &&
        typeof policyPack.name === 'string' &&
        typeof policyPack.version === 'string' &&
        typeof policyPack.ruleCount === 'number' &&
        typeof policyPack.fingerprint === 'string');
}
function readPolicyLockFile(cwd) {
    const path = getPolicyLockPath(cwd);
    if (!(0, fs_1.existsSync)(path)) {
        return {
            path,
            exists: false,
            lock: null,
        };
    }
    try {
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!isPolicyLockFileShape(parsed)) {
            return {
                path,
                exists: true,
                lock: null,
                error: 'Invalid lock schema',
            };
        }
        return {
            path,
            exists: true,
            lock: parsed,
        };
    }
    catch (error) {
        return {
            path,
            exists: true,
            lock: null,
            error: error instanceof Error ? error.message : 'Failed to parse lock file',
        };
    }
}
function writePolicyLockFile(cwd, lock) {
    const path = getPolicyLockPath(cwd);
    (0, fs_1.writeFileSync)(path, JSON.stringify(lock, null, 2) + '\n', 'utf-8');
    return path;
}
function buildPolicyStateSnapshot(input) {
    const defaultRules = (0, policy_engine_1.createDefaultPolicy)().rules;
    const policyPackRules = input.policyPackRules || [];
    const includeDashboardPolicies = input.includeDashboardPolicies === true;
    const customRules = includeDashboardPolicies ? input.customRules || [] : [];
    const customPolicyRefs = includeDashboardPolicies ? buildCustomPolicyRefs(input.customPolicies || []) : [];
    const effectiveRules = [...defaultRules, ...policyPackRules, ...customRules];
    return {
        schemaVersion: 1,
        generatedAt: input.generatedAt || new Date().toISOString(),
        defaultRules: {
            count: defaultRules.length,
            fingerprint: fingerprintRules(defaultRules),
        },
        policyPack: input.policyPack
            ? {
                id: input.policyPack.packId,
                name: input.policyPack.packName,
                version: input.policyPack.version,
                ruleCount: policyPackRules.length,
                fingerprint: fingerprintRules(policyPackRules),
            }
            : null,
        customPolicies: {
            mode: includeDashboardPolicies ? 'dashboard' : 'disabled',
            count: customPolicyRefs.length,
            fingerprint: fingerprintJson(customPolicyRefs),
            mappedRuleCount: customRules.length,
            mappedRulesFingerprint: fingerprintRules(customRules),
            refs: customPolicyRefs,
        },
        effective: {
            ruleCount: effectiveRules.length,
            fingerprint: fingerprintRules(effectiveRules),
        },
    };
}
function comparePolicyStateToLock(lock, current) {
    const mismatches = [];
    if (lock.customPolicies.mode !== current.customPolicies.mode) {
        mismatches.push({
            code: 'POLICY_LOCK_MODE_MISMATCH',
            message: 'Custom policy mode does not match lock',
            expected: lock.customPolicies.mode,
            actual: current.customPolicies.mode,
        });
    }
    const lockPack = lock.policyPack;
    const currentPack = current.policyPack;
    const lockPackRef = lockPack ? `${lockPack.id}@${lockPack.version}` : 'none';
    const currentPackRef = currentPack ? `${currentPack.id}@${currentPack.version}` : 'none';
    if (lockPackRef !== currentPackRef) {
        mismatches.push({
            code: 'POLICY_LOCK_PACK_MISMATCH',
            message: 'Installed policy pack does not match lock',
            expected: lockPackRef,
            actual: currentPackRef,
        });
    }
    else if (lockPack && currentPack && lockPack.fingerprint !== currentPack.fingerprint) {
        mismatches.push({
            code: 'POLICY_LOCK_PACK_MISMATCH',
            message: 'Policy pack rules changed from lock baseline',
            expected: lockPack.fingerprint,
            actual: currentPack.fingerprint,
        });
    }
    if (lock.defaultRules.fingerprint !== current.defaultRules.fingerprint) {
        mismatches.push({
            code: 'POLICY_LOCK_DEFAULT_RULES_MISMATCH',
            message: 'Default policy rules fingerprint changed',
            expected: lock.defaultRules.fingerprint,
            actual: current.defaultRules.fingerprint,
        });
    }
    if (lock.customPolicies.fingerprint !== current.customPolicies.fingerprint) {
        mismatches.push({
            code: 'POLICY_LOCK_CUSTOM_POLICIES_MISMATCH',
            message: 'Dashboard custom policies changed from lock baseline',
            expected: lock.customPolicies.fingerprint,
            actual: current.customPolicies.fingerprint,
        });
    }
    if (lock.customPolicies.mappedRulesFingerprint !== current.customPolicies.mappedRulesFingerprint) {
        mismatches.push({
            code: 'POLICY_LOCK_CUSTOM_RULES_MISMATCH',
            message: 'Mapped custom policy rules changed from lock baseline',
            expected: lock.customPolicies.mappedRulesFingerprint,
            actual: current.customPolicies.mappedRulesFingerprint,
        });
    }
    if (lock.effective.fingerprint !== current.effective.fingerprint) {
        mismatches.push({
            code: 'POLICY_LOCK_EFFECTIVE_RULES_MISMATCH',
            message: 'Effective policy set changed from lock baseline',
            expected: lock.effective.fingerprint,
            actual: current.effective.fingerprint,
        });
    }
    return mismatches;
}
function evaluatePolicyLock(cwd, current, options) {
    const requireLock = options?.requireLock === true;
    const read = readPolicyLockFile(cwd);
    const mismatches = [];
    if (read.error) {
        mismatches.push({
            code: 'POLICY_LOCK_INVALID',
            message: `Policy lock file is invalid: ${read.error}`,
        });
    }
    if (!read.lock && requireLock) {
        mismatches.push({
            code: 'POLICY_LOCK_MISSING',
            message: 'Policy lock file is required but missing',
        });
    }
    if (read.lock) {
        mismatches.push(...comparePolicyStateToLock(read.lock, current));
    }
    const enforced = requireLock || read.exists;
    return {
        lockPath: read.path,
        lockFileFound: read.exists,
        lockPresent: read.lock !== null,
        enforced,
        matched: mismatches.length === 0,
        mismatches,
        lock: read.lock,
    };
}
//# sourceMappingURL=policy-packs.js.map