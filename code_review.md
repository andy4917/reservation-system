# Guardrail Review

## Review Focus

- Reject raw endpoints outside `src/platform/endpoints.ts`.
- Reject feature flags outside `src/platform/flags/registry.ts`.
- Reject direct `process.env` access outside `src/platform/config/env.ts`.
- Reject new fallback, bypass, or legacy logic unless the exception is registered and unexpired.
- Reject docs drift when mapped code areas changed without the required Markdown updates.
- Reject temporary comments such as `TODO`, `HACK`, or `TEMP`.

## Required Evidence

- Direct command output for:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:type`
  - `npm run test:unit`
  - `npm run test:contract`
  - `npm run test:integration`
  - `npm run check:exceptions`
  - `npm run check:docs-impact`
- Remote enforcement evidence when GitHub protected branch features are available:
  - `npm run check:remote-policy`
  - If the command returns `BLOCKED`, attach the exact blocker message and treat remote policy enforcement as still open.
  - Required checks should be pinned to the `GitHub Actions` app (`app_id=15368`) unless the manifest is explicitly changed.
- Negative proof when relevant:
  - raw endpoint fixture fails lint
  - direct env fixture fails lint
  - ad-hoc flag fixture fails lint
  - unhandled request fails integration tests
  - expired exception fixture fails validation
  - docs-impact drift fixture fails validation

## Ownership

- `governance/**`, `src/platform/**`, `.github/**`, and `docs/**` require code owner review.
- If a temporary adapter remains, the reviewer must verify owner, approver, expiry, tests, and docs in `governance/exceptions.yaml`.
