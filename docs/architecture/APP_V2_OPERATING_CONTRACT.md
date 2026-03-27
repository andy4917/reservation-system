# App V2 Operating Contract

Electron main is the source of truth for provider browser lifecycle, storage reads, and runtime state snapshots.

Renderer is a thin control panel. It may trigger IPC actions and display preflight summary data, but it must not become the operating decision engine.

Verification and smoke paths are not product runtime. `UHS_APP_V2_RUNTIME_VERIFY`, `app-v2-smoke:`, and other verify-only flows must stay isolated from the default app launch path.

Do not promote probe, smoke, placeholder, or fallback logic into the default runtime path.

The provider operating adapter owns heuristic operating verdicts and provider operating evidence derivation.

provider operating adapter outputs provider operating evidence from raw browser signals.

heuristic operating verdicts must not live in providerWorkspaceManager.
