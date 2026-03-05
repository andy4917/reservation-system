#include "drift_engine.hpp"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <stdexcept>
#include <string>

namespace py = pybind11;

namespace inventory_core {

namespace {

std::string trim_copy(const std::string& value) {
    const auto start = value.find_first_not_of(" \t\n\r\f\v");
    if (start == std::string::npos) {
        return "";
    }
    const auto end = value.find_last_not_of(" \t\n\r\f\v");
    return value.substr(start, end - start + 1);
}

std::string to_upper_copy(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char c) {
        return static_cast<char>(std::toupper(c));
    });
    return value;
}

bool is_truthy(const py::handle& value) {
    if (value.is_none()) {
        return false;
    }
    return PyObject_IsTrue(value.ptr()) == 1;
}

long long safe_int(const py::handle& value) {
    if (value.is_none()) {
        return 0;
    }
    if (py::isinstance<py::bool_>(value)) {
        return value.cast<bool>() ? 1 : 0;
    }
    if (py::isinstance<py::int_>(value)) {
        return value.cast<long long>();
    }

    std::string text;
    const py::object obj = py::reinterpret_borrow<py::object>(value);
    if (is_truthy(obj)) {
        text = trim_copy(py::str(obj).cast<std::string>());
    }
    if (text.empty()) {
        return 0;
    }

    try {
        const double parsed = std::stod(text);
        if (!std::isfinite(parsed)) {
            return 0;
        }
        return static_cast<long long>(parsed);
    } catch (...) {
        return 0;
    }
}

std::string normalize_provider_key(const py::handle& value) {
    std::string text;
    if (!value.is_none()) {
        const py::object obj = py::reinterpret_borrow<py::object>(value);
        if (is_truthy(obj)) {
            text = trim_copy(py::str(obj).cast<std::string>());
        }
    }
    text = to_upper_copy(text);
    if (text.empty()) {
        return "UNKNOWN";
    }
    return text;
}

py::object dict_get(const py::dict& values, const char* key) {
    return values.attr("get")(py::str(key), py::none());
}

}  // namespace

py::dict drift_compute(const py::dict& payload) {
    const std::string provider_key = normalize_provider_key(dict_get(payload, "provider_key"));

    py::list rows;
    if (payload.contains("reconciliation") && py::isinstance<py::dict>(payload["reconciliation"])) {
        const auto reconciliation = py::reinterpret_borrow<py::dict>(payload["reconciliation"]);
        if (reconciliation.contains("rows") && py::isinstance<py::list>(reconciliation["rows"])) {
            rows = py::reinterpret_borrow<py::list>(reconciliation["rows"]);
        }
    }

    py::list actions;
    long long drift_dates = 0;

    for (auto row_obj : rows) {
        if (!py::isinstance<py::dict>(row_obj)) {
            continue;
        }
        const auto row = py::reinterpret_borrow<py::dict>(row_obj);

        const std::string day = trim_copy(py::str(dict_get(row, "date")).cast<std::string>());
        const long long desired_units = safe_int(dict_get(row, "desired_units"));
        const long long actual_units = safe_int(dict_get(row, "actual_units"));
        const long long drift_units = safe_int(dict_get(row, "drift_units"));

        if (day.empty()) {
            continue;
        }
        if (drift_units == 0) {
            continue;
        }

        drift_dates += 1;

        py::dict action;
        action["date"] = py::str(day);
        action["desired_units"] = py::int_(desired_units);
        action["actual_units"] = py::int_(actual_units);
        action["drift_units"] = py::int_(drift_units);
        action["action"] = py::str(drift_units > 0 ? "increase" : "decrease");
        actions.append(action);
    }

    py::dict out;
    out["provider"] = py::str(provider_key);
    out["drift_dates"] = py::int_(drift_dates);
    out["planned_action_count"] = py::int_(actions.size());
    out["actions"] = actions;
    return out;
}

}  // namespace inventory_core
