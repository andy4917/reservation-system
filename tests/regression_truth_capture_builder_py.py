from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        output_path = Path(temp_dir) / "bundle.json"
        command = [
            sys.executable,
            str(ROOT / "scripts" / "build_truth_capture_bundle.py"),
            "--spec",
            "truth_dataset/fixtures/sample_capture_spec.json",
            "--output",
            str(output_path),
        ]
        completed = subprocess.run(command, cwd=ROOT, check=True, capture_output=True, text=True)
        result = json.loads(completed.stdout)
        assert result["ok"] is True
        assert output_path.exists()

        built = json.loads(output_path.read_text(encoding="utf-8"))
        sample = json.loads((ROOT / "truth_dataset" / "fixtures" / "sample_live_capture_bundle.json").read_text(encoding="utf-8"))

        assert built["contract_version"] == sample["contract_version"]
        assert built["manifest"]["bundle_id"] == sample["manifest"]["bundle_id"]
        assert built["entities"]["sheet_rows"] == sample["entities"]["sheet_rows"]
        assert built["entities"]["wings_reservations"] == sample["entities"]["wings_reservations"]
        assert built["entities"]["ota_inventory_rows"] == sample["entities"]["ota_inventory_rows"]
        assert built["entities"]["ota_reservations"] == sample["entities"]["ota_reservations"]
        assert built["entities"]["bridge_events"] == sample["entities"]["bridge_events"]

    print("regression_truth_capture_builder_py: OK")


if __name__ == "__main__":
    main()
