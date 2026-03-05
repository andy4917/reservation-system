from __future__ import annotations

import sys
from pathlib import Path

from setuptools import Extension, setup

import pybind11

ROOT = Path(__file__).resolve().parent

if sys.platform.startswith("win"):
    extra_compile_args = ["/std:c++17", "/O2"]
else:
    extra_compile_args = ["-std=c++17", "-O3"]

ext_modules = [
    Extension(
        name="inventory_cpp_core",
        sources=[
            str(ROOT / "core" / "bindings.cpp"),
            str(ROOT / "core" / "reconciliation_engine.cpp"),
            str(ROOT / "core" / "drift_engine.cpp"),
            str(ROOT / "core" / "allocation_engine.cpp"),
            str(ROOT / "core" / "scan_engine.cpp"),
        ],
        include_dirs=[
            pybind11.get_include(),
            str(ROOT / "core"),
        ],
        language="c++",
        extra_compile_args=extra_compile_args,
    )
]

setup(
    name="inventory-cpp-core",
    version="0.1.0",
    description="C++ compute core for inventory sync",
    ext_modules=ext_modules,
)
