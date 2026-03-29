# Repository Guardrails

- Do not add fallbacks, bypasses, shadow routes, or legacy compatibility paths unless registered in the documented operating contract or an explicitly tracked repo exception file.
- Do not add raw endpoint calls outside the endpoint registry.
- Do not add feature flags outside the current repo-owned flag/config registry.
- Unknown cases must fail explicitly. Do not guess. Do not silently fallback.
- For behavior changes, add or update a failing test first.
- Prefer deleting obsolete code over preserving compatibility branches.
- If public behavior, API, or operator workflow changes, update mapped Markdown docs in the same change.
- Do not access environment variables outside the config layer.
- Do not leave TODO, HACK, or TEMP comments.
- Do not commit live credentials, tokens, cookies, auth bundles, or OAuth secrets.
- Before completion, all required checks must pass for the touched surface. For `app_v2`, this includes `npm run app:check`; add targeted regression commands when behavior changes.
