from __future__ import annotations

import importlib
import os
from functools import lru_cache
from typing import Any, Optional

_VALID_MODES = {"auto", "required", "off"}
_DEFAULT_MODULE_NAME = "inventory_cpp_core"


def get_cpp_mode() -> str:
    mode = str(os.getenv("INVENTORY_CPP_MODE", "auto") or "auto").strip().lower()
    if mode not in _VALID_MODES:
        return "auto"
    return mode


def get_cpp_module_name() -> str:
    name = str(os.getenv("INVENTORY_CPP_MODULE", _DEFAULT_MODULE_NAME) or _DEFAULT_MODULE_NAME).strip()
    return name or _DEFAULT_MODULE_NAME


@lru_cache(maxsize=8)
def _import_cpp_module(module_name: str) -> Any:
    return importlib.import_module(module_name)


def reset_cpp_module_cache() -> None:
    _import_cpp_module.cache_clear()


def load_cpp_module() -> Optional[Any]:
    mode = get_cpp_mode()
    if mode == "off":
        return None

    module_name = get_cpp_module_name()
    try:
        return _import_cpp_module(module_name)
    except Exception as exc:  # noqa: BLE001
        if mode == "required":
            raise RuntimeError(
                f"INVENTORY_CPP_MODE=required but module '{module_name}' failed to load: {exc}"
            ) from exc
        return None
