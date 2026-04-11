# Neurcode Workflow Overview

Use this page to understand what Neurcode is for and which command to run next.

## What Neurcode is

Neurcode is an AI delivery governance system:
- compile deterministic policy rules before generation
- create scoped change contracts before implementation
- generate implementation prompts from approved contracts/plans
- verify code changes against policy and scope
- keep an auditable trail across local and CI workflows

## What Neurcode is not

- Not a replacement IDE
- Not only an architecture-plan generator
- Not a broad filesystem scanner by default

Neurcode is optimized for controlled delivery inside an explicit repository scope.

## Core path (default)

```text
init -> policy compile -> plan -> prompt -> verify -> ship
```

This path should cover most day-to-day feature work.

## Command map by intent

- Set identity and project scope:
  - `neurcode login`, `neurcode init`, `neurcode whoami`
- Compile deterministic policy constraints:
  - `neurcode policy compile --intent "..."`
  - or one-step stack bootstrap: `neurcode policy bootstrap node`
- Define scoped change contract:
  - `neurcode plan "..." --ticket ...`
- Generate coding instructions:
  - `neurcode prompt`
- Enforce governance before merge:
  - `neurcode verify --record --compiled-policy neurcode.policy.compiled.json --enforce-change-contract --require-signed-artifacts`
- Submit false-positive/false-negative feedback for admin triage:
  - `neurcode feedback submit <verification-id> --type false_positive --reason "..."`
  - `neurcode feedback inbox --status pending --org-wide`
  - `neurcode feedback stats --org-wide --days 30 --limit 10`
- Run auto-remediation loop:
  - `neurcode ship "..."`
- Ask grounded repository questions:
  - `neurcode ask "..."`
- Predict blast radius:
  - `neurcode simulate --base origin/main`

## Single-repo vs multi-repo

Default behavior is single-repo isolation.

Only opt into cross-repo context intentionally:

```bash
neurcode repo link ../backend --alias backend
neurcode repo list
```

## CI workflow mapping

- PR gate:
  - `verify` via GitHub Action package
- Monorepo quality gate:
  - runtime compatibility manifest + handshake contract, JSON contracts, isolation, scale, SLO, enterprise smoke
- Evaluation calibration gate:
  - real-world plan eval matrix + drift baseline (`plan-eval-baseline` workflow)
- Strict release gate:
  - production-like E2E checks on protected paths

## Recommended rollout order for teams

1. Adopt `init -> policy compile -> plan -> verify` in one repo.
2. Add CI gate with enterprise-mode verify defaults.
3. Add `prompt` and `ship` for faster implementation cycles.
4. Add `simulate` for pre-merge risk prediction.
5. Enable multi-repo linking only where architecture requires it.
