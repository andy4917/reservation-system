# App V2 Operating Contract

Electron main is the source of truth for runtime orchestration, provider windows, settings, and verification state.

Renderer is a thin control panel. It renders current state, launches explicit actions, and must not invent product truth, cached demo results, or synthetic success states on its own.

Verification and smoke paths are not product runtime. `verify-only` flows, `UHS_APP_V2_RUNTIME_VERIFY`, and `app-v2-smoke:` hooks may observe runtime state, but they must not be promoted into the default user path.

## Runtime Boundaries

- `providerWorkspaceManager` owns provider window lifecycle and raw page signals only.
- providerWorkspaceManager must stay on window lifecycle and raw page signals.
- heuristic operating verdicts must not live in providerWorkspaceManager.
- provider operating adapter is the only place that may derive readiness from raw provider signals.
- provider operating evidence must remain explicit and inspectable from Electron main.

## Product Path Rules

- Do not promote probe, smoke, placeholder, or fallback logic into the default runtime path.
- Renderer must not unlock downstream actions from readiness-only checks that did not execute the real product path.
- Demo, fixture, or replay-only inputs must stay outside the default runtime path.
- preflight summary must describe actual configuration truth and provider state, not guessed readiness.
