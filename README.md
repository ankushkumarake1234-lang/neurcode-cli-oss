# Neurcode CLI OSS

This repository is an automated, sanitized export of the public CLI surface from the private Neurcode monorepo.

## What is included
- Prebuilt `@neurcode-ai/cli` runtime artifacts (`packages/cli/dist`)
- CLI docs and OSS governance docs

## What is intentionally excluded
- Private API/control-plane implementation
- Internal workspace sources outside the public CLI package
- Local runtime artifacts and credential-bearing files

## Validate
```bash
pnpm install
pnpm oss:check
pnpm oss:check:boundary
pnpm cli:help
```

If you need the maintained GitHub Action package, use the dedicated public repository:
- `sujit-jaunjal/neurcode-actions`
