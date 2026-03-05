from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def assert_secret_hygiene(file_path: Path, *, require_embedded_flag: bool = False) -> None:
    text = file_path.read_text(encoding="utf-8")
    if require_embedded_flag:
        assert "const EMBEDDED_AUTH_MODE = false;" in text
    assert not re.search(r"GOCSPX-[A-Za-z0-9_-]+", text)
    assert not re.search(r'1//[A-Za-z0-9._-]{20,}', text)


def main() -> None:
    assert_secret_hygiene(ROOT / "src" / "constants.js", require_embedded_flag=True)
    assert_secret_hygiene(ROOT / "src" / "sheetScanner.entry.js")
    print("regression_secret_hygiene_py: OK")


if __name__ == "__main__":
    main()
