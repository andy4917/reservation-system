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
TEST_FIXTURE_TMP_PATH_RE = re.compile(r"\"[^\"]*/tmp/[^\"]*\"")
PACKAGE_LOCK_TMP_RESOLVED_RE = re.compile(
    r"\"resolved\"\s*:\s*\"https?://registry\.npmjs\.org/.*/-/tmp-[^\"]+\""
)
ALLOWED_TMP_FIXTURE_PATHS = frozenset({"tests/regression_app_v2_runtime_safety_behavior.mjs"})
LOCAL_URL_RE = re.compile(r"https?://(?:localhost|127\.0\.0\.1)(?::\d+)?")
PLACEHOLDER_RE = re.compile(r"(?i)\b(TODO|FIXME|TEMP|temporary|dummy|lorem ipsum)\b")
APP_RUNTIME_RULES = [
    {
        "paths": ("app_v2/main/", "app_v2/renderer/", "app/services/", "app/contracts/"),
        "tokens": ("uiMockState", "dry-run", "replay", "fixture-fallback", "FIXTURE_FALLBACK_ACTIVE"),
        "message": "App runtime path still references fixture/demo execution.",
    },
    {
        "paths": ("app_v2/renderer/",),
        "tokens": (
            "const PROVIDER_LABELS",
            'coexMain: "코엑스"',
            'coexAnnex: "코엑스2"',
            'gangnam: "강남"',
            'reportWindowDays: "5"',
            "mockShellData",
        ),
        "message": "Renderer still contains hardcoded operational defaults or legacy presentation data.",
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
    {
        "paths": ("app_v2/main/settingsStore.ts", "app_v2/main/ipc.ts", "app_v2/main/liveReadActions.ts", "app_v2/main/reservationActionRunner.ts"),
        "tokens": (
            'coexMain: normalizeText(tabs.coexMain) || "코엑스"',
            'coexAnnex: normalizeText(tabs.coexAnnex) || "코엑스2"',
            'gangnam: normalizeText(tabs.gangnam) || "강남"',
            "reportWindowDays: Number(payload.reportWindowDays ?? 5)",
            "windowDays:${settings.config?.reportWindowDays ?? 5}",
            "windowDays:${settingsSummary.config?.reportWindowDays ?? 5}",
            "topK: Number((payload.bgeM3 as Record<string, unknown>).topK ?? 5)",
            "scoreThreshold: Number((payload.bgeM3 as Record<string, unknown>).scoreThreshold ?? 0.72)",
            "topK: Number.isFinite(Number(bge.topK)) ? Number(bge.topK) : 5",
            "scoreThreshold: Number.isFinite(Number(bge.scoreThreshold)) ? Number(bge.scoreThreshold) : 0.72",
            "bgeTopK:${bge?.topK ?? 5}",
            "bgeThreshold:${bge?.scoreThreshold ?? 0.72}",
        ),
        "message": "Runtime still contains branch-specific or date-window default hardcoding.",
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

DIST_APP_ATOMIC_MESSAGE = "dist-app package.json must be written atomically"


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


def is_allowed_absolute_path_match(rel: str, line: str, match: re.Match[str]) -> bool:
    snippet = match.group(0)

    if snippet.startswith("/tmp/") and rel == "package-lock.json" and PACKAGE_LOCK_TMP_RESOLVED_RE.search(line):
        return True

    if snippet.startswith("/tmp/") and rel in ALLOWED_TMP_FIXTURE_PATHS and TEST_FIXTURE_TMP_PATH_RE.search(line):
        return True

    return False


def scan_file(root: Path, file_path: Path) -> list[dict[str, str]]:
    text = file_path.read_text(encoding="utf-8", errors="ignore")
    rel = normalize(str(file_path.relative_to(root)))
    findings: list[dict[str, str]] = []
    if LOCAL_URL_RE.search(text):
        findings.append({"type": "localhost_url", "file": rel, "message": "Localhost URL found in changed file."})
    if rel not in PLACEHOLDER_IGNORE_PATHS and not rel.startswith(ABSOLUTE_PATH_IGNORE_PREFIXES):
        for line in text.splitlines():
            for match in ABSOLUTE_PATH_RE.finditer(line):
                if is_allowed_absolute_path_match(rel, line, match):
                    continue
                findings.append(
                    {
                        "type": "absolute_path",
                        "file": rel,
                        "message": "Machine-local absolute path found in changed file.",
                    }
                )
                break
            else:
                continue
            break
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
