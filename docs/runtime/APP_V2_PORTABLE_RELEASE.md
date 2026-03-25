# APP_V2 Portable Release

`app_v2` desktop shell is distributed as a Windows portable folder.

## Build

Run:

```bash
npm run app:dist:portable
```

## Output

Artifacts are written under:

```text
dist/uhs-desktop-portable
```

The folder contains:

- Electron runtime
- `resources/app/dist-app` built app payload
- `resources/app/src` runtime JS modules used by live read / PMS fetch
- `resources/app/scripts/app_v2_live_sheet_bridge.py` and `resources/app/scripts/app_v2_reservation_management_bridge.py` for bridge operations
- shared `icons/` assets
- `Launch UHS Desktop.cmd`
- `README.txt`

## Release Notes

- The desktop app icon is regenerated with `npm run app:icons:regen`.
- Desktop window and provider workspace windows use the shared icon assets from `icons/`.
- Distribution is currently portable-folder based. Zip the whole `dist/uhs-desktop-portable` directory for handoff.
