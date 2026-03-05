#pragma once

#include <pybind11/pybind11.h>

namespace inventory_core {

pybind11::dict drift_compute(const pybind11::dict& payload);

}  // namespace inventory_core
