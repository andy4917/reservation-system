from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory


ROOT = Path(__file__).resolve().parents[1]


def run_hygiene(cwd: Path) -> dict:
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts" / "check_contract_hygiene.py"),
            "--cwd",
            str(cwd),
            "--json",
        ],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    return json.loads(result.stdout)


def main() -> None:
    with TemporaryDirectory() as tmpdir:
        repo = Path(tmpdir)
        subprocess.run(["git", "-C", str(repo), "init", "-q"], check=True)
        subprocess.run(["git", "-C", str(repo), "config", "user.name", "contract-hygiene-test"], check=True)
        subprocess.run(["git", "-C", str(repo), "config", "user.email", "contract-hygiene-test@example.com"], check=True)

        (repo / "src" / "app-v2" / "bootstrap.ts").parent.mkdir(parents=True, exist_ok=True)
        (repo / "src" / "app-v2" / "bootstrap.ts").write_text("export const seed = true;\n", encoding="utf-8")
        (repo / "tests" / "seed.test.mjs").parent.mkdir(parents=True, exist_ok=True)
        (repo / "tests" / "seed.test.mjs").write_text("export default {};\n", encoding="utf-8")
        subprocess.run(["git", "-C", str(repo), "add", "src/app-v2/bootstrap.ts", "tests/seed.test.mjs"], check=True)
        subprocess.run(["git", "-C", str(repo), "commit", "-qm", "baseline"], check=True)

        package_name = "tmp"
        package_lock = {
            "name": "tmp-path-allowlist-fixture",
            "lockfileVersion": 3,
            "packages": {},
            "dependencies": {
                package_name: {
                    "version": "0.2.5",
                    "resolved": f"https://registry.npmjs.org/{package_name}/-/{package_name}-0.2.5.tgz",
                }
            },
        }
        (repo / "package-lock.json").write_text(json.dumps(package_lock, indent=2) + "\n", encoding="utf-8")

        tmp_root = chr(47) + "tmp"
        runtime_fixture = repo / "tests" / "regression_app_v2_runtime_safety_behavior.mjs"
        runtime_fixture.write_text(
            f"""\
            const gangnamHar = "{tmp_root}/g.har";
            const coexHar = "{tmp_root}/c.har";
            """.strip(),
            encoding="utf-8",
        )

        real_absolute_path = repo / "src" / "app-v2" / "real_paths.ts"
        real_absolute_path.parent.mkdir(parents=True, exist_ok=True)
        home_root = chr(47) + "home"
        real_absolute_path.write_text(
            f'const leaked = "{home_root}/user/secrets.json";\n',
            encoding="utf-8",
        )

        payload = run_hygiene(repo)
        findings = payload["findings"]

        assert all(
            f["file"] != "package-lock.json" for f in findings
        ), payload
        assert all(
            f["file"] != "tests/regression_app_v2_runtime_safety_behavior.mjs" for f in findings
        ), payload
        assert any(
            f["type"] == "absolute_path" and f["file"] == "src/app-v2/real_paths.ts" for f in findings
        ), payload

        print("regression_contract_hygiene_absolute_path_allowlist_py: OK")


if __name__ == "__main__":
    main()
