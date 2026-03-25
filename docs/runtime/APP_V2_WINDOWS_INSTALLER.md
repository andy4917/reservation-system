# APP_V2 Windows Portable EXE

`app_v2` desktop shell is packaged as a Windows portable `.exe` (no dedicated installer package).

## Build

```bash
npm run app:dist:win
```

The command regenerates icons, rebuilds `app_v2`, and runs `electron-builder` for a Windows portable executable.

## Output

Primary executable artifact:

```text
dist/installer/UHS Reservation Desktop 0.1.0.exe
```

Runtime support assets are copied as packaged resources so the portable executable can still load:

- `src/**/*.js` runtime modules
- `scripts/app_v2_live_sheet_bridge.py`
- `scripts/app_v2_reservation_management_bridge.py`

## Notes

- The folder name `dist/installer` is historical. The artifact itself is still a Windows portable `.exe`.
- Output target is `portable` on Windows x64.
- The generated `.exe` can be run directly without a dedicated installer package.
- The desktop icon uses `icons/desktop-icon.ico`.
