#include <pybind11/pybind11.h>

#include "allocation_engine.hpp"
#include "drift_engine.hpp"
#include "reconciliation_engine.hpp"
#include "scan_engine.hpp"

namespace py = pybind11;

PYBIND11_MODULE(inventory_cpp_core, m) {
    m.doc() = "Inventory compute core (reconciliation/drift/allocation)";

    m.def("reconciliation_compute", &inventory_core::reconciliation_compute, py::arg("payload"));
    m.def("drift_compute", &inventory_core::drift_compute, py::arg("payload"));
    m.def("allocation_compute", &inventory_core::allocation_compute, py::arg("payload"));
    m.def("scan_compute", &inventory_core::scan_compute, py::arg("payload"));
}
