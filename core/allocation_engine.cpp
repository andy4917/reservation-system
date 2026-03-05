#include "allocation_engine.hpp"

#include <algorithm>
#include <stdexcept>
#include <string>
#include <vector>

namespace py = pybind11;

namespace inventory_core {

namespace {

py::object builtin_int() {
    static py::object fn = py::module_::import("builtins").attr("int");
    return fn;
}

bool is_truthy(const py::handle& value) {
    if (value.is_none()) {
        return false;
    }
    return PyObject_IsTrue(value.ptr()) == 1;
}

long long to_int_strict(const py::handle& value) {
    if (value.is_none()) {
        return 0;
    }
    const py::object obj = py::reinterpret_borrow<py::object>(value);
    return builtin_int()(obj).cast<long long>();
}

std::vector<std::string> parse_ordered_room_ids(const py::handle& room_ids_obj) {
    std::vector<std::string> ordered;
    if (room_ids_obj.is_none()) {
        return ordered;
    }
    if (!py::isinstance<py::list>(room_ids_obj) && !py::isinstance<py::tuple>(room_ids_obj)) {
        return ordered;
    }

    for (auto item : room_ids_obj) {
        const py::object item_obj = py::reinterpret_borrow<py::object>(item);
        if (!is_truthy(item_obj)) {
            continue;
        }
        ordered.push_back(py::str(item_obj).cast<std::string>());
    }
    return ordered;
}

long long get_current_stock(const py::dict& current_stock_by_room, const std::string& room_id) {
    const py::str key(room_id);
    if (!current_stock_by_room.contains(key)) {
        return 0;
    }
    return to_int_strict(current_stock_by_room[key]);
}

bool vector_contains(const std::vector<std::string>& values, const std::string& target) {
    return std::find(values.begin(), values.end(), target) != values.end();
}

py::object dict_get(const py::dict& values, const char* key) {
    return values.attr("get")(py::str(key), py::none());
}

py::dict allocate_room_units_binary(const py::dict& payload) {
    const auto ordered = parse_ordered_room_ids(dict_get(payload, "room_ids"));
    if (ordered.empty()) {
        return py::dict();
    }

    py::dict current_stock_by_room;
    if (payload.contains("current_stock_by_room") && py::isinstance<py::dict>(payload["current_stock_by_room"])) {
        current_stock_by_room = py::reinterpret_borrow<py::dict>(payload["current_stock_by_room"]);
    }

    const long long target_units = to_int_strict(dict_get(payload, "target_units"));
    const long long limit = std::max(0LL, std::min(target_units, static_cast<long long>(ordered.size())));

    std::vector<std::string> selected;
    selected.reserve(static_cast<size_t>(limit));

    for (const auto& rid : ordered) {
        if (static_cast<long long>(selected.size()) >= limit) {
            break;
        }
        if (get_current_stock(current_stock_by_room, rid) > 0) {
            selected.push_back(rid);
        }
    }
    for (const auto& rid : ordered) {
        if (static_cast<long long>(selected.size()) >= limit) {
            break;
        }
        if (!vector_contains(selected, rid)) {
            selected.push_back(rid);
        }
    }

    py::dict out;
    for (const auto& rid : ordered) {
        out[py::str(rid)] = py::int_(vector_contains(selected, rid) ? 1 : 0);
    }
    return out;
}

py::dict allocate_room_units_flexible_impl(const py::dict& payload) {
    const auto ordered = parse_ordered_room_ids(dict_get(payload, "room_ids"));
    if (ordered.empty()) {
        return py::dict();
    }

    py::dict current_stock_by_room;
    if (payload.contains("current_stock_by_room") && py::isinstance<py::dict>(payload["current_stock_by_room"])) {
        current_stock_by_room = py::reinterpret_borrow<py::dict>(payload["current_stock_by_room"]);
    }

    py::dict out;
    for (const auto& rid : ordered) {
        out[py::str(rid)] = py::int_(0);
    }

    long long remaining = std::max(to_int_strict(dict_get(payload, "target_units")), 0LL);

    for (const auto& rid : ordered) {
        if (remaining <= 0) {
            break;
        }
        const long long current = std::max(get_current_stock(current_stock_by_room, rid), 0LL);
        if (current <= 0) {
            continue;
        }
        const long long keep = std::min(current, remaining);
        out[py::str(rid)] = py::int_(keep);
        remaining -= keep;
    }

    size_t idx = 0;
    while (remaining > 0 && !ordered.empty()) {
        const std::string& rid = ordered[idx % ordered.size()];
        const py::str key(rid);
        const long long current = to_int_strict(out[key]);
        out[key] = py::int_(current + 1);
        remaining -= 1;
        idx += 1;
    }

    return out;
}

}  // namespace

py::dict allocation_compute(const py::dict& payload) {
    const std::string mode = payload.contains("mode") ? py::str(payload["mode"]).cast<std::string>() : std::string();
    if (mode == "binary") {
        return allocate_room_units_binary(payload);
    }
    if (mode == "flexible") {
        return allocate_room_units_flexible_impl(payload);
    }
    throw std::runtime_error("allocation_compute: unsupported mode");
}

}  // namespace inventory_core
