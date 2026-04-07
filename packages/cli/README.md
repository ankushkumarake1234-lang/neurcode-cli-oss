# @neurcode-ai/cli

Neurcode CLI is a governance-focused AI coding runtime.

It helps teams plan changes, ask grounded repository questions, verify policy/scope adherence, and ship with deterministic controls.

## Install

```bash
npm install -g @neurcode-ai/cli@latest
neurcode --version
```

## Quick Workflow

```bash
neurcode login
neurcode init

neurcode bootstrap --pack soc2 --auto-detect
neurcode contract import --provider codex --auto-detect --no-confirm
neurcode prompt "Implement role-based access control for org members"
neurcode verify --record --compiled-policy neurcode.policy.compiled.json --enforce-change-contract --require-signed-artifacts
```

To preview possible auto-detected plans before import:

```bash
neurcode contract import --provider codex --auto-detect --list-candidates --json
```

## Read-only Q&A

```bash
neurcode ask "Where is orgId resolved in auth middleware?"
```

## One-command delivery

```bash
neurcode ship "Harden session middleware" --max-fix-attempts 3 --test-command "pnpm test:ci"
```

## Brain context controls

```bash
neurcode brain status
neurcode brain mode --storage-mode no-code
neurcode brain doctor "is userid used instead of org id"
```

## Enterprise Governance Signing

Use signed AI change logs for fail-closed governance in `verify`/`ship`.

```bash
# Mandatory signed logs (fail closed when key material is missing)
export NEURCODE_GOVERNANCE_REQUIRE_SIGNED_LOGS=1

# Single-key mode
export NEURCODE_GOVERNANCE_SIGNING_KEY="<strong-random-secret>"
export NEURCODE_GOVERNANCE_SIGNING_KEY_ID="kid-prod-2026-03"

# Key rotation mode (key ring)
export NEURCODE_GOVERNANCE_SIGNING_KEYS="kid-prev=<old-secret>,kid-prod-2026-03=<new-secret>"
export NEURCODE_GOVERNANCE_SIGNING_KEY_ID="kid-prod-2026-03"
```

Notes:
- `verify` writes and verifies `.neurcode/ai-change-log.json` with integrity chain checks.
- If signed logs are required and integrity/signature checks fail, `verify` exits non-zero.
- `ship` will block deployment when required signed AI logs are missing/invalid.
- `policy compile` and `plan` auto-sign deterministic artifacts when governance signing keys are configured.
- Use `--require-signed-artifacts` (or `NEURCODE_VERIFY_REQUIRE_SIGNED_ARTIFACTS=1`) to fail closed on unsigned/tampered artifacts.

## Docs

- CLI docs: https://neurcode.com/docs/cli
- Repo docs: https://github.com/sujit-jaunjal/neurcode
