#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEXT_EXTS = {
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".mjs",
    ".cjs",
    ".py",
    ".json",
    ".yaml",
    ".yml",
    ".md",
    ".css",
    ".scss",
    ".html",
    ".xml",
    ".sh",
    ".toml",
}
ABSOLUTE_PATH_RE = re.compile(r"(?:[A-Za-z]:\\(?:Users|home|mnt)\\|/(?:Users|home|mnt|var|tmp)/)")
LOCAL_URL_RE = re.compile(r"https?://(?:localhost|127\.0\.0\.1)(?::\d+)?")
PLACEHOLDER_RE = re.compile(r"(?i)\b(TODO|FIXME|TEMP|temporary|dummy|lorem ipsum)\b")
APP_RUNTIME_RULES = [
    {
        "paths": ("app/main/", "app/renderer/", "app/services/", "app/contracts/"),
        "tokens": ("uiMockState", "dry-run", "replay", "fixture-fallback", "FIXTURE_FALLBACK_ACTIVE"),
        "message": "App runtime path still references fixture/demo execution.",
    },
    {
        "paths": ("src/constants.js", "src/io/sheets.fetch.js", "app/main/ipc.ts"),
        "tokens": (
            "SYNC_FEATURE_KEY_LEGACY",
            "FIXED_NAVER_BUSINESS_ID",
            "FIXED_STATION_BRANCH_ID",
            "DEFAULT_SPREADSHEET_ID",
            "DEFAULT_SHEET_NAME",
            "DEFAULT_START_ROW",
            "DEFAULT_YEAR",
            "DEFAULT_GOOGLE_CLIENT_ID",
        ),
        "message": "Core runtime path still contains legacy compatibility or hardcoded operational defaults.",
    },
]
EXCLUDES = (
    ".git/",
    "node_modules/",
    "__pycache__/",
    ".venv/",
    "venv/",
    "dist/",
    "build/",
    "out/",
    ".next/",
)
ABSOLUTE_PATH_IGNORE_PREFIXES = ("docs/runtime/",)
PLACEHOLDER_CODE_EXTS = {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".sh"}
PLACEHOLDER_IGNORE_PATHS = {"scripts/check_contract_hygiene.py"}


def normalize(path: str) -> str:
    text = path.replace("\\", "/").strip()
    if text.startswith("./"):
        text = text[2:]
    return text.lstrip("/")


def changed_files(root: Path) -> list[Path]:
    proc = subprocess.run(
        ["git", "-C", str(root), "status", "--short", "--untracked-files=normal"],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "git status failed")
    out: list[Path] = []
    for raw_line in proc.stdout.splitlines():
        if not raw_line:
            continue
        path = raw_line[3:].strip()
        if " -> " in path:
            path = path.split(" -> ", 1)[1].strip()
        rel = normalize(path)
        if any(rel == prefix.rstrip("/") or rel.startswith(prefix) for prefix in EXCLUDES):
            continue
        file_path = (root / rel).resolve()
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in TEXT_EXTS and file_path.name not in {"Dockerfile", ".env", ".env.example"}:
            continue
        out.append(file_path)
    return sorted(set(out))


def find_forbidden_tokens(rel: str, text: str) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    for rule in APP_RUNTIME_RULES:
        if not any(rel == path.rstrip("/") or rel.startswith(path.rstrip("/") + "/") for path in rule["paths"]):
            continue
        for token in rule["tokens"]:
            if token in text:
                findings.append({"type": "forbidden_runtime_token", "file": rel, "token": token, "message": rule["message"]})
    return findings


def scan_file(root: Path, file_path: Path) -> list[dict[str, str]]:
    text = file_path.read_text(encoding="utf-8", errors="ignore")
    rel = normalize(str(file_path.relative_to(root)))
    findings: list[dict[str, str]] = []
    if LOCAL_URL_RE.search(text):
        findings.append({"type": "localhost_url", "file": rel, "message": "Localhost URL found in changed file."})
    if ABSOLUTE_PATH_RE.search(text) and not rel.startswith(ABSOLUTE_PATH_IGNORE_PREFIXES):
        findings.append({"type": "absolute_path", "file": rel, "message": "Machine-local absolute path found in changed file."})
    if rel not in PLACEHOLDER_IGNORE_PATHS and file_path.suffix.lower() in PLACEHOLDER_CODE_EXTS and PLACEHOLDER_RE.search(text):
        findings.append({"type": "placeholder_marker", "file": rel, "message": "Placeholder/debug marker found in changed file."})
    findings.extend(find_forbidden_tokens(rel, text))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cwd", default=str(ROOT))
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    root = Path(args.cwd).resolve()
    files = changed_files(root)
    findings: list[dict[str, str]] = []
    for file_path in files:
        findings.extend(scan_file(root, file_path))

    payload = {
        "cwd": str(root),
        "changed_file_count": len(files),
        "finding_count": len(findings),
        "findings": findings,
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        if findings:
            for finding in findings:
                print(f"{finding['file']}: {finding['type']}: {finding['message']}")
        else:
            print("check_contract_hygiene: OK")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
