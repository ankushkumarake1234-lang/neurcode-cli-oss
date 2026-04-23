"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateAdvisorySignals = evaluateAdvisorySignals;
function toUnixPath(filePath) {
    return String(filePath || '').replace(/\\/g, '/');
}
function unique(items) {
    return [...new Set(items)];
}
function isRequestLayerPath(path) {
    return /(\/|^)(route|routes|controller|controllers|handler|handlers|api)(\/|$)/i.test(path);
}
function isTestPath(path) {
    return /(^|\/)(__tests__|tests?|test)(\/|$)|\.(test|spec)\.[A-Za-z0-9]+$/i.test(path);
}
function isCodePath(path) {
    return /\.(ts|tsx|js|jsx|mjs|cjs|py|go|java|rb|cs|php|rs|kt|swift)$/i.test(path);
}
function isInfraPath(path) {
    return /(\/|^)(infra|terraform|k8s|kubernetes|helm|ansible|iac|cloudformation|pulumi|\.github\/workflows)(\/|$)/i.test(path);
}
function isAppPath(path) {
    return /(\/|^)(src|app|services|packages|web)(\/|$)/i.test(path);
}
function isGeneratedArtifactPath(path) {
    const normalized = path.toLowerCase();
    return (normalized.endsWith('.map')
        || normalized.includes('/dist/')
        || normalized.includes('/build/')
        || normalized.includes('/coverage/')
        || normalized.includes('/.next/')
        || normalized.includes('/out/')
        || /\.min\.(js|css)$/.test(normalized));
}
function classifySensitiveDomains(path) {
    const normalized = path.toLowerCase();
    const domains = [];
    if (/\b(auth|rbac|permission|acl|identity|oauth|session|jwt)\b/.test(normalized)) {
        domains.push('auth');
    }
    if (/\b(payment|billing|invoice|refund|wallet|checkout)\b/.test(normalized)) {
        domains.push('payment');
    }
    if (/\b(db|database|prisma|migration|sql|repository|repositories)\b/.test(normalized)) {
        domains.push('data');
    }
    if (isInfraPath(normalized)) {
        domains.push('infra');
    }
    return domains;
}
function findAddedLines(diffFiles) {
    const lines = [];
    for (const file of diffFiles) {
        const filePath = toUnixPath(file.path);
        for (const hunk of file.hunks || []) {
            for (const line of hunk.lines || []) {
                if (line.type === 'added') {
                    lines.push({ file: filePath, content: line.content });
                }
            }
        }
    }
    return lines;
}
function limitFiles(files, max = 6) {
    const deduped = unique(files);
    if (deduped.length <= max)
        return deduped;
    return deduped.slice(0, max);
}
function evaluateAdvisorySignals(input) {
    const diffFiles = input.diffFiles || [];
    const changedPaths = unique(diffFiles.map((file) => toUnixPath(file.path)).filter(Boolean));
    const totalFiles = input.summary?.totalFiles ?? changedPaths.length;
    const totalAdded = input.summary?.totalAdded ?? 0;
    const totalRemoved = input.summary?.totalRemoved ?? 0;
    const signals = [];
    const sensitiveDomains = new Set();
    const filesBySensitiveDomain = {};
    for (const path of changedPaths) {
        const domains = classifySensitiveDomains(path);
        for (const domain of domains) {
            sensitiveDomains.add(domain);
            if (!filesBySensitiveDomain[domain]) {
                filesBySensitiveDomain[domain] = [];
            }
            filesBySensitiveDomain[domain].push(path);
        }
    }
    if (sensitiveDomains.size >= 2) {
        const domains = [...sensitiveDomains].sort((a, b) => a.localeCompare(b));
        const files = limitFiles(domains.flatMap((domain) => filesBySensitiveDomain[domain] || []));
        signals.push({
            code: 'SENSITIVE_DOMAIN_SPAN',
            severity: 'warn',
            title: 'Changes span multiple sensitive domains',
            detail: `Changes touch ${domains.join(' + ')} modules in one diff. ` +
                'This pattern often indicates unintended side effects or architectural drift.',
            files,
        });
    }
    const dbCallPattern = /\b(prisma|db|sequelize)\.[A-Za-z_$][A-Za-z0-9_$]*\.[A-Za-z_$][A-Za-z0-9_$]*\s*\(|\bknex\s*\(/;
    const directDbRequestLayerFiles = findAddedLines(diffFiles)
        .filter((line) => isRequestLayerPath(line.file) && dbCallPattern.test(line.content))
        .map((line) => line.file);
    if (directDbRequestLayerFiles.length > 0) {
        signals.push({
            code: 'DIRECT_DB_IN_REQUEST_LAYER',
            severity: 'warn',
            title: 'Direct DB access detected in request layer',
            detail: 'Route/controller code now calls the DB directly. This can bypass service-layer controls and increase drift risk.',
            files: limitFiles(directDbRequestLayerFiles),
        });
    }
    const totalDelta = totalAdded + totalRemoved;
    if (totalFiles >= 15 || totalDelta >= 600) {
        signals.push({
            code: 'LARGE_CHANGE_SURFACE',
            severity: 'warn',
            title: 'Large change surface',
            detail: `This diff touches ${totalFiles} file(s) and ${totalDelta} changed line(s). ` +
                'Large surfaces reduce review certainty and raise drift probability.',
            files: limitFiles(changedPaths),
        });
    }
    const codeFilesTouched = changedPaths.filter((path) => isCodePath(path) && !isTestPath(path) && !path.startsWith('docs/'));
    const nonGeneratedCodeFilesTouched = codeFilesTouched.filter((path) => !isGeneratedArtifactPath(path));
    const testFilesTouched = changedPaths.filter((path) => isTestPath(path));
    if (nonGeneratedCodeFilesTouched.length >= 3 && testFilesTouched.length === 0) {
        signals.push({
            code: 'CODE_WITHOUT_TEST_UPDATES',
            severity: nonGeneratedCodeFilesTouched.length >= 8 ? 'warn' : 'info',
            title: 'Code changed without test updates',
            detail: `Detected ${nonGeneratedCodeFilesTouched.length} code file change(s) with no test file updates. ` +
                'Behavior drift may go unnoticed without verification tests.',
            files: limitFiles(nonGeneratedCodeFilesTouched),
        });
    }
    const infraFiles = changedPaths.filter((path) => isInfraPath(path));
    const appFiles = changedPaths.filter((path) => isAppPath(path) && !isInfraPath(path));
    if (infraFiles.length > 0 && appFiles.length > 0) {
        signals.push({
            code: 'INFRA_AND_APP_MIXED',
            severity: 'warn',
            title: 'Infra and app code changed together',
            detail: 'This diff mixes infrastructure and application edits. Consider splitting for clearer intent and rollback safety.',
            files: limitFiles([...infraFiles, ...appFiles]),
        });
    }
    const secretPattern = /(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_-]?key|secret|password)\s*[:=]\s*(?:"[^"]{8,}"|'[^']{8,}'|`[^`]{8,}`))/i;
    const possibleSecretFiles = findAddedLines(diffFiles)
        .filter((line) => !isGeneratedArtifactPath(line.file))
        .filter((line) => line.content.trim().length <= 240)
        .filter((line) => !/\[REDACTED\]|process\.env\./i.test(line.content))
        .filter((line) => secretPattern.test(line.content))
        .map((line) => line.file);
    if (possibleSecretFiles.length > 0) {
        signals.push({
            code: 'POSSIBLE_SECRET_ADDITION',
            severity: 'warn',
            title: 'Possible secret-like value added',
            detail: 'Detected new lines resembling secrets or credentials. Validate redaction and secret management before merge.',
            files: limitFiles(possibleSecretFiles),
        });
    }
    const precedence = { warn: 0, info: 1 };
    return signals
        .sort((left, right) => {
        const severityDelta = precedence[left.severity] - precedence[right.severity];
        if (severityDelta !== 0)
            return severityDelta;
        return left.title.localeCompare(right.title);
    })
        .slice(0, 4);
}
//# sourceMappingURL=advisory-signals.js.map