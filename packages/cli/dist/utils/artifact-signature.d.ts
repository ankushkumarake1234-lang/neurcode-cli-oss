export interface GovernanceArtifactSignature {
    algorithm: 'hmac-sha256';
    keyId: string | null;
    signedAt: string;
    payloadHash: string;
    value: string;
}
export interface GovernanceArtifactSigningConfig {
    signingKey: string | null;
    signingKeyId: string | null;
    signingKeys: Record<string, string>;
}
export interface GovernanceArtifactSignatureVerificationResult {
    present: boolean;
    signed: boolean;
    valid: boolean;
    required: boolean;
    keyId: string | null;
    verifiedWithKeyId: string | null;
    payloadHash: string | null;
    issues: string[];
}
export declare function parseSigningKeyRing(raw: string | undefined): Record<string, string>;
export declare function resolveGovernanceArtifactSigningConfigFromEnv(): GovernanceArtifactSigningConfig;
export declare function computeGovernanceArtifactPayloadHash(artifact: unknown): string;
export declare function signGovernanceArtifact<T extends object>(artifact: T, config: GovernanceArtifactSigningConfig): T;
export declare function verifyGovernanceArtifactSignature(input: {
    artifact: Record<string, unknown>;
    requireSigned: boolean;
    signingKey: string | null;
    signingKeyId: string | null;
    signingKeys: Record<string, string>;
}): GovernanceArtifactSignatureVerificationResult;
//# sourceMappingURL=artifact-signature.d.ts.map