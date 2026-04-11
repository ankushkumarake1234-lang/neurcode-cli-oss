# Workflow Overview

Neurcode CLI supports three practical workflows.

## A) Login + Policy-First Governance (recommended)

Use this as the default onboarding and day-to-day workflow.

```bash
neurcode login
neurcode init
neurcode policy install soc2
neurcode policy compile --intent "Do not use console.log; Do not use TODO"
neurcode verify --policy-only
```

Recommended for:

- contributor onboarding
- cohorts and internal training
- policy-first change gating before plan/delivery

If you are not inside a git repository yet, initialize one first:

```bash
git init
git add .
git commit -m "chore: baseline"
```

## B) Plan-Enforced Delivery (cloud-assisted)

Use this for full plan adherence + governance workflows.

```bash
neurcode plan "Describe intended change"
neurcode prompt
neurcode verify --record --enforce-change-contract --compiled-policy neurcode.policy.compiled.json
neurcode ship "Deliver scoped change" --max-fix-attempts 2
```

Recommended for:

- production delivery workflows
- tracked ticket/PR execution
- adherence and evidence reporting

## C) Imported Plan Workflow (Codex/Claude/Cursor/ChatGPT)

```bash
neurcode contract import --provider codex --auto-detect --list-candidates
neurcode contract import --provider codex --auto-detect --no-confirm
neurcode verify --record --enforce-change-contract
```

## Notes for maintainers

- `policy lock --no-dashboard` is optional and best used for deterministic OSS/CI pipelines.
- Logged-in users can run `verify` without manually exporting governance signing keys; local signing material is provisioned automatically when needed by org policy.
- Use `--require-deterministic-match` only when policy intent statements are compatible with deterministic templates.
- Run `pnpm ci:oss` before merging OSS changes.
