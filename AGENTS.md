# Repository Guardrails

- Do not add fallbacks, bypasses, shadow routes, or legacy compatibility paths unless registered in `governance/exceptions.yaml`.
- Do not add raw endpoint calls outside the endpoint registry.
- Do not add feature flags outside `src/platform/flags/registry.ts`.
- Unknown cases must fail explicitly. Do not guess. Do not silently fallback.
- For behavior changes, add or update a failing test first.
- Prefer deleting obsolete code over preserving compatibility branches.
- If public behavior, API, or operator workflow changes, update mapped Markdown docs in the same change.
- Do not access environment variables outside the config layer.
- Do not leave TODO, HACK, or TEMP comments.
- Do not commit live credentials, tokens, cookies, auth bundles, or OAuth secrets.
- Before completion, all required checks must pass: `lint`, `typecheck`, `test:type`, `test:unit`, `test:contract`, `test:integration`, `check:exceptions`, `check:docs-impact`.
