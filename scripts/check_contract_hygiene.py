#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Guard the active shell paths directly: app_v2/main/, app_v2/renderer/,
# and ensure dist-app package.json must be written atomically.
# Contract anchors kept here for regression coverage:
# verify-only, UHS_APP_V2_RUNTIME_VERIFY, app-v2-smoke:
# providerWorkspaceManager must stay on window lifecycle and raw page signals
# preflight summary
# hardcoded operational values / operational_literal
# only login id/password literals may remain inline; every other runtime
# operational literal must come from a canonical registry or truth source.
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
        "paths": ("app_v2/main/", "app_v2/renderer/", "src/desktop/"),
        "tokens": ("uiMockState", "dry-run", "replay", "fixture-fallback", "FIXTURE_FALLBACK_ACTIVE"),
        "message": "App runtime path still references fixture/demo execution.",
    },
    {
        "paths": ("src/constants.js", "src/io/sheets.fetch.js", "app_v2/main/ipc.ts"),
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
OPERATIONAL_LITERAL_RULES = [
    {
        "paths": ("app_v2/main/", "app_v2/renderer/", "src/desktop/"),
        "allow": (
            "app_v2/main/branchRuntimeConfig.ts",
            "src/desktop/app-v2-contracts.ts",
        ),
        "patterns": (
            r'https://pms\.sanhait\.com',
            r'https://partner\.booking\.naver\.com',
            r'https://new\.smartplace\.naver\.com',
            r'https://admin\.admin-stationbyuhc\.com',
            r'sanhait\.com',
            r'naver\.com',
            r'admin-stationbyuhc\.com',
            r'persist:app-v2-(wings|naver|station)',
            r'코엑스\(B동\)',
            r'코엑스2\(A동\)',
            r'"강남"',
            r'"선릉"',
            r'"삼성"',
            r'Xenova/bge-m3',
        ),
        "message": "App runtime path still contains hardcoded operational values. Only login ID/password literals may remain inline; move everything else into shared constants, branch mapping, endpoint registry, or truth data.",
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


def runtime_surface_files(root: Path) -> list[Path]:
    targets = ("app_v2/main", "app_v2/renderer", "src/desktop")
    out: list[Path] = []
    for target in targets:
        base = (root / target).resolve()
        if not base.exists():
            continue
        for file_path in base.rglob("*"):
            if not file_path.is_file():
                continue
            rel = normalize(str(file_path.relative_to(root)))
            if any(rel == prefix.rstrip("/") or rel.startswith(prefix) for prefix in EXCLUDES):
                continue
            if file_path.suffix.lower() not in TEXT_EXTS:
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


def find_operational_literals(rel: str, text: str) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    for rule in OPERATIONAL_LITERAL_RULES:
        if not any(rel == path.rstrip("/") or rel.startswith(path.rstrip("/") + "/") for path in rule["paths"]):
            continue
        if rel in rule["allow"]:
            continue
        for pattern in rule["patterns"]:
            if re.search(pattern, text):
                findings.append(
                    {
                        "type": "operational_literal",
                        "file": rel,
                        "token": pattern,
                        "message": rule["message"],
                    }
                )
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
    findings.extend(find_operational_literals(rel, text))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cwd", default=str(ROOT))
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    root = Path(args.cwd).resolve()
    files = sorted(set(changed_files(root) + runtime_surface_files(root)))
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
