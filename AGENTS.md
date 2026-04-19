# Reservation-System Repo Contract

- Global workspace authority is `~/.codex/workspace_authority.json`, and the generated global runtime in `~/.codex/AGENTS.md` is the only global policy source.
- This file may define reservation-system-only rules; do not duplicate workspace topology, canonical roots, fallback config, or global cleanup rules here.
- Shared validators exposed under `scripts/` must stay backed by the canonical Workflow source, not copied back into this repo.
- Project-local rules belong only in `AGENTS.md`, `.codex/config.toml`, `contracts/`, and truly project-specific scripts.
- Do not hardcode operational values in product runtime files.
- Only login ID/password literals are allowed inline.
- Move every other operational value into the shared constants registry, settings store, branch runtime mapping, endpoint registry, or truth dataset.
- Before close-out, run `python scripts/check_traceability.py` and `python scripts/delivery_gate.py --mode verify`.
- The project `delivery_gate.py` wrapper must produce fresh evidence, refresh the derived review snapshot, then run the global scorecard gate and summary export.
- Reviewer truth and workspace authority are runtime state outside this repo. Writers must not edit them directly.
- Use Serena first to activate the current project or worktree, check onboarding, and prefer symbol/reference tools before repeated whole-file reads.
- Use Context7 before changing external frameworks, APIs, SDKs, configuration, auth, payment, booking, availability, schema, or migration behavior.
- Do not claim verification success unless the command output was actually observed.
- First-time Serena bootstrap for this repo: `uv tool install -p 3.13 serena-agent@latest --prerelease=allow`, `serena init`, `cd /home/andy4917/Dev-Product/reservation-system && serena project create --index`, activate in Codex, run onboarding, review memories, then start a fresh task thread.
