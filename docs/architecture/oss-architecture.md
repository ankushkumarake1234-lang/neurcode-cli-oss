# OSS Architecture and Boundary

This document explains what is public in the OSS repository, what remains managed, and how components interact.

## Public OSS components

- CLI OSS snapshot repository (`neurcode-cli-oss`) with prebuilt CLI runtime artifacts (`packages/cli/dist`)
- GitHub Action OSS snapshot repository (`neurcode-actions`) with prebuilt action runtime artifacts (`dist`)
- OSS governance and release hygiene scripts (`scripts/oss-*.mjs`)

## Managed/private components

- hosted multi-tenant API and control plane
- billing and identity provider infrastructure
- managed organization analytics and operations backplane

Public repositories expose user-facing runtime entrypoints while keeping most private control-plane implementation and internal workspace source out of the exported snapshots.

## High-level flow

1. CLI resolves project scope and repository boundary.
2. `plan` builds bounded context and requests planning from API.
3. `prompt` transforms approved plan to implementation guidance.
4. `verify` enforces policy/scope against current diffs.
5. MCP and GitHub actions consume the same CLI/runtime contracts.
6. CI repeats deterministic checks with stricter thresholds.

## Repository isolation model

- default scan root is constrained to current git repository
- cross-repo override is blocked by default
- explicit cross-repo access requires `neurcode repo link`
- home-directory roots are blocked unless explicitly enabled

## CI guard layers

- contract tests
- MCP tool contract tests (`test:mcp-contracts`) to validate tool list + JSON payload compatibility
- hardening matrix (OOM, path isolation, symlink boundaries)
- plan scale gate + delta regression gate
- plan SLO status + delta drift gate
- enterprise smoke and strict release gate

## Verification source observability

- `verification_source` is recorded on both `plan_verifications` and `action_verifications`
- values currently emitted:
  - `api` (control-plane verification path)
  - `local_fallback` (CLI deterministic fallback when API verify is unavailable)
  - `policy_only` (general governance mode with no linked plan)
- dashboard governance views aggregate source distribution so operators can detect fallback drift

## Extension points for enterprise adopters

- policy packs and lock/governance files
- repo link model for intentional multi-repo context
- CI threshold env vars for staged hardening
- branch protection + fallback push policy guardrails

## Change ownership guidance

- CLI/runtime behavior changes: `packages/cli`, `packages/*`
- CI/governance policy behavior: `.github/workflows`, `scripts/*`
- docs/positioning/onboarding: `README.md`, `docs/*`, `CONTRIBUTING.md`

Keep each PR scoped to one layer when possible to reduce rollout risk.
