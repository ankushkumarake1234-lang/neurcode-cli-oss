# Contributing to Neurcode

Thanks for contributing. This repo enforces governance and security checks strictly.

Read these before your first PR:
- `README.md`
- `docs/workflow-overview.md`
- `docs/architecture/oss-architecture.md`

## Local setup

```bash
pnpm install
pnpm oss:check
pnpm build:cli
```

## Development workflow

1. Create a branch from `main`.
2. Keep changes scoped to one concern per PR.
3. Run the minimum required checks before opening PR:

```bash
pnpm oss:check
pnpm build:cli
pnpm test:contracts
```

## Security requirements

- Never commit credentials, tokens, private keys, or `.env` files.
- Never commit local runtime/cache artifacts (`.neurcode/`, `.pnpm-store/`, local DB dumps).
- If a secret is exposed, rotate it first, then open a fix PR.

## Commit and PR quality

- Use clear commit messages (example: `fix(cli): prevent cross-repo scan outside git root`).
- Include a short verification section in PR description:
  - commands run
  - expected vs actual behavior
  - risk/rollback notes
