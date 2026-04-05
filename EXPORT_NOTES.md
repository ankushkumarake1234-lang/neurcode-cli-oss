# Export Notes

- profile: `cli`
- source: private `neurcode` monorepo
- strategy: expose only prebuilt CLI runtime and public docs
- excluded: private backend/control plane and internal workspace sources

Post-export validation:
```bash
pnpm oss:check
pnpm oss:check:boundary
```
