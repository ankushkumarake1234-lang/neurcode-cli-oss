# 15-Minute Getting Started

Use this guide when onboarding new contributors or running a cohort.

## Prerequisites

- Node.js `>=18`
- `pnpm`
- git

## 1) Clone and install

```bash
git clone https://github.com/sujit-jaunjal/neurcode-cli-oss.git
cd neurcode-cli-oss
pnpm install
```

## 2) Validate OSS safety and CLI surface

```bash
pnpm ci:oss
```

This confirms:

- no obvious secret-bearing files are tracked
- export boundaries are respected
- the CLI command surface is available
- command and auto-detect smoke checks pass

## 3) Explore commands

```bash
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js policy --help
node packages/cli/dist/index.js verify --help
```

## 4) Login + policy-first demo (recommended)

In any git repo:

```bash
neurcode login
neurcode init
neurcode policy install soc2
neurcode policy compile --intent "Do not use console.log; Do not use TODO"
neurcode verify --policy-only
```

If this folder is not yet a git repository, run:

```bash
git init
git add .
git commit -m "chore: baseline"
```

## 5) Plan-enforced flow

```bash
neurcode plan "Implement role-based access"
neurcode prompt
neurcode verify --record --compiled-policy neurcode.policy.compiled.json --enforce-change-contract
```

## 6) External assistant plan import

```bash
neurcode contract import --provider codex --auto-detect --list-candidates --json
neurcode contract import --provider codex --auto-detect --no-confirm
```
