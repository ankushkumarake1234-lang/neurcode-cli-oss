"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maskSecretsInText = maskSecretsInText;
const REDACTION_PLACEHOLDER = '[REDACTED_BY_NEURCODE]';
/**
 * Lightweight secret masking for local persistence (cache/memory files).
 *
 * This intentionally avoids importing the full SecurityGuard (ts-morph heavy),
 * while still masking the most common secret patterns that users may paste into
 * CLI intents or context files.
 */
function maskSecretsInText(text) {
    if (!text)
        return { masked: text, changed: false };
    let masked = text;
    const before = masked;
    // Direct token patterns
    masked = masked.replace(/\bAKIA[0-9A-Z]{16}\b/gi, REDACTION_PLACEHOLDER); // AWS access key id
    masked = masked.replace(/\b(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}\b/gi, REDACTION_PLACEHOLDER); // GitHub tokens
    // JWTs (common shape)
    masked = masked.replace(/\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, REDACTION_PLACEHOLDER);
    // Connection strings / URLs with credentials
    masked = masked.replace(/\b((?:postgresql?|mysql|mongodb(?:\+srv)?|redis):\/\/)([^\s]+)/gi, `$1${REDACTION_PLACEHOLDER}`);
    // sshpass password inline
    masked = masked.replace(/\b(sshpass\s+-p\s+)(['"])([^'"]+)\2/gi, `$1$2${REDACTION_PLACEHOLDER}$2`);
    // bearer/token/apikey style assignments (keep the left side; redact the value)
    masked = masked.replace(/\b((?:bearer|token|apikey)\s*[:=]\s*['"]?)([a-zA-Z0-9_\-]{32,})(['"]?)/gi, `$1${REDACTION_PLACEHOLDER}$3`);
    // generic secret-like assignments (keep the left side; redact the value)
    masked = masked.replace(/\b((?:password|secret|key|api[_-]?key|private[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*['"]?)([a-zA-Z0-9_\-+/=]{20,})(['"]?)/gi, `$1${REDACTION_PLACEHOLDER}$3`);
    // PEM private keys (multi-line)
    masked = masked.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, REDACTION_PLACEHOLDER);
    return { masked, changed: masked !== before };
}
//# sourceMappingURL=secret-masking.js.map