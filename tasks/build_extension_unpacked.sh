#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/dist/uhs-extension"
ZIP_PATH="${ROOT_DIR}/dist/uhs-extension.zip"

cd "${ROOT_DIR}"

if [[ ! -f manifest.json ]]; then
  echo "manifest.json not found in ${ROOT_DIR}" >&2
  exit 1
fi

try_install_python3() {
  if command -v python3 >/dev/null 2>&1; then
    return 0
  fi

  echo "[build_extension_unpacked] python3 not found. Trying auto-install..." >&2

  if command -v apt-get >/dev/null 2>&1; then
    if command -v sudo >/dev/null 2>&1; then
      sudo apt-get update && sudo apt-get install -y python3 || true
    else
      apt-get update && apt-get install -y python3 || true
    fi
  elif command -v dnf >/dev/null 2>&1; then
    if command -v sudo >/dev/null 2>&1; then
      sudo dnf install -y python3 || true
    else
      dnf install -y python3 || true
    fi
  elif command -v yum >/dev/null 2>&1; then
    if command -v sudo >/dev/null 2>&1; then
      sudo yum install -y python3 || true
    else
      yum install -y python3 || true
    fi
  elif command -v pacman >/dev/null 2>&1; then
    if command -v sudo >/dev/null 2>&1; then
      sudo pacman -Sy --noconfirm python || true
    else
      pacman -Sy --noconfirm python || true
    fi
  elif command -v brew >/dev/null 2>&1; then
    brew install python || true
  elif command -v winget >/dev/null 2>&1; then
    winget install -e --id Python.Python.3.12 --silent --accept-source-agreements --accept-package-agreements || true
  elif command -v choco >/dev/null 2>&1; then
    choco install -y python --no-progress || true
  fi

  if ! command -v python3 >/dev/null 2>&1; then
    echo "[build_extension_unpacked] python3 설치에 실패했습니다. Python 3를 먼저 설치한 뒤 다시 실행하세요." >&2
    exit 1
  fi
}

try_install_python3

mapfile -t FILES < <(
  python3 - <<'PY'
import json

with open("manifest.json", "r", encoding="utf-8") as fp:
    manifest = json.load(fp)

out = {"manifest.json"}

bg = (manifest.get("background") or {}).get("service_worker")
if isinstance(bg, str) and bg.strip():
    out.add(bg.strip())

for script in manifest.get("content_scripts") or []:
    for js in script.get("js") or []:
        if isinstance(js, str) and js.strip():
            out.add(js.strip())

for path in (manifest.get("icons") or {}).values():
    if isinstance(path, str) and path.strip():
        out.add(path.strip())

default_icon = (manifest.get("action") or {}).get("default_icon")
if isinstance(default_icon, str) and default_icon.strip():
    out.add(default_icon.strip())
elif isinstance(default_icon, dict):
    for path in default_icon.values():
        if isinstance(path, str) and path.strip():
            out.add(path.strip())

print("\n".join(sorted(out)))
PY
)

rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"

for file in "${FILES[@]}"; do
  if [[ ! -f "${file}" ]]; then
    echo "Missing required file: ${file}" >&2
    exit 1
  fi
  mkdir -p "${OUT_DIR}/$(dirname "${file}")"
  cp "${file}" "${OUT_DIR}/${file}"
done

BAD_PATHS="$(find "${OUT_DIR}" -mindepth 1 -printf '%P\n' | awk -F/ '{for (i=1; i<=NF; i++) if ($i ~ /^_/) { print; break }}' || true)"
if [[ -n "${BAD_PATHS}" ]]; then
  echo "Invalid paths found (segment starts with underscore):" >&2
  echo "${BAD_PATHS}" >&2
  exit 1
fi

echo "Created unpacked extension folder:"
echo "  ${OUT_DIR}"

if command -v zip >/dev/null 2>&1; then
  rm -f "${ZIP_PATH}"
  (
    cd "${ROOT_DIR}/dist"
    zip -rq "$(basename "${ZIP_PATH}")" "$(basename "${OUT_DIR}")"
  )
  echo "Created zip package:"
  echo "  ${ZIP_PATH}"
else
  rm -f "${ZIP_PATH}"
  export ROOT_DIR OUT_DIR ZIP_PATH
  python3 - <<'PY'
import os
import zipfile

root = os.environ["ROOT_DIR"]
out_dir = os.environ["OUT_DIR"]
zip_path = os.environ["ZIP_PATH"]
dist_dir = os.path.join(root, "dist")

with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
    for dirpath, _dirnames, filenames in os.walk(out_dir):
        for filename in filenames:
            full_path = os.path.join(dirpath, filename)
            rel_to_dist = os.path.relpath(full_path, dist_dir)
            zf.write(full_path, rel_to_dist)
PY
  echo "Created zip package (python fallback):"
  echo "  ${ZIP_PATH}"
fi
