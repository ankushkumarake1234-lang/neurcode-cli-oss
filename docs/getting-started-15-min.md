# Neurcode 15-Minute Quickstart

This guide gets a new engineer from zero to first successful governed change in one repository.

## What success looks like

At the end of this flow, you will have:
- initialized repo scope with `neurcode init`
- compiled deterministic policy constraints
- generated a scoped change contract
- generated an implementation prompt
- verified policy + scope constraints
- produced a clean pass signal for PR readiness

## Prerequisites

- Node.js 20+
- `npm install -g @neurcode-ai/cli@latest`
- logged in with an org-scoped key (`neurcode login`)
- a git repository checked out locally

## 1) Scope the repository

```bash
neurcode init
neurcode whoami
```

Expected:
- repo is linked to a Neurcode project
- org/project context is visible in `whoami`

## 2) Compile policy constraints first (deterministic)

```bash
neurcode policy compile --intent "No auth bypass, no secret literals" --require-deterministic-match
```

Expected:
- `neurcode.policy.compiled.json` generated with policy fingerprint
- deterministic constraints ready for local and CI verify

## 3) Create scoped change contract

```bash
neurcode plan "Add org-level RBAC to admin routes" --ticket NEU-123
```

Expected:
- plan/contract generated with repository-bounded context
- confidence/coverage signals shown
- no cross-repo leakage in file references

## 4) Create implementation prompt

```bash
neurcode prompt
```

Expected:
- prompt reflects scoped contract, acceptance criteria, and constraints

## 5) Implement in your coding tool, then verify

```bash
neurcode verify --record --compiled-policy neurcode.policy.compiled.json --enforce-change-contract
```

Expected:
- deterministic policy + scope checks
- explicit pass/fail with violations and file references
- governance record emitted for auditability

## 6) Optional autonomous remediation loop

```bash
neurcode ship "Add org-level RBAC to admin routes" --max-fix-attempts 3 --test-command "pnpm test:ci"
```

Expected:
- iterative plan/apply/verify loop
- resumable checkpoints if interrupted

## Enterprise-friendly defaults

- Keep to the core flow first: `init -> policy compile -> plan -> prompt -> verify -> ship`
- Use explicit cross-repo opt-in only when needed:
  - `neurcode repo link ../backend --alias backend`
- Keep governance deterministic in CI with:
  - `enterprise_mode: true`
  - `changed_files_only: true`

## If something fails

```bash
neurcode doctor
neurcode config --show
neurcode plan-slo status --json
```

Then check:
- auth context is valid (`whoami`)
- repository root is correct
- CI gate thresholds are aligned with current baselines
- feedback quality is trending down (`neurcode feedback stats --org-wide --days 30`)

## Next docs

- [Workflow Overview](./workflow-overview.md)
- [CLI Commands](./cli-commands.md)
- [Enterprise Setup Guide](./enterprise-setup.md)
- [Enterprise Release Operations](./release-operations.md)
- [Open-Source Release Runbook](./open-source-release.md)
