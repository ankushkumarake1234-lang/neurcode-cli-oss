/**
 * Lightweight secret masking for local persistence (cache/memory files).
 *
 * This intentionally avoids importing the full SecurityGuard (ts-morph heavy),
 * while still masking the most common secret patterns that users may paste into
 * CLI intents or context files.
 */
export declare function maskSecretsInText(text: string): {
    masked: string;
    changed: boolean;
};
//# sourceMappingURL=secret-masking.d.ts.map