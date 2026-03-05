#include "reconciliation_engine.hpp"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <map>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

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

std::string normalize_text(const py::handle& value) {
    if (value.is_none()) {
        return "";
    }
    const py::object obj = py::reinterpret_borrow<py::object>(value);
    return trim_copy(py::str(obj).cast<std::string>());
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

long long int_only(const py::handle& value) {
    if (value.is_none()) {
        return 0;
    }
    if (py::isinstance<py::int_>(value)) {
        return value.cast<long long>();
    }
    return 0;
}

std::set<std::string> parse_room_id_set(const py::handle& room_ids_obj) {
    std::set<std::string> out;
    if (room_ids_obj.is_none()) {
        return out;
    }
    if (!py::isinstance<py::list>(room_ids_obj) && !py::isinstance<py::tuple>(room_ids_obj)) {
        return out;
    }
    for (auto item : room_ids_obj) {
        const py::object item_obj = py::reinterpret_borrow<py::object>(item);
        const std::string rid = trim_copy(py::str(item_obj).cast<std::string>());
        if (!rid.empty()) {
            out.insert(rid);
        }
    }
    return out;
}

py::dict build_sorted_int_map(const std::map<std::string, long long>& values) {
    py::dict out;
    for (const auto& [day, value] : values) {
        out[py::str(day)] = py::int_(value);
    }
    return out;
}

std::map<std::string, long long> parse_sorted_int_map(const py::handle& input_obj) {
    std::map<std::string, long long> out;
    if (input_obj.is_none() || !py::isinstance<py::dict>(input_obj)) {
        return out;
    }

    const auto input = py::reinterpret_borrow<py::dict>(input_obj);
    std::vector<std::string> keys;
    keys.reserve(py::len(input));
    for (auto item : input) {
        keys.push_back(py::str(item.first).cast<std::string>());
    }
    std::sort(keys.begin(), keys.end());
    keys.erase(std::unique(keys.begin(), keys.end()), keys.end());

    for (const auto& key : keys) {
        out[key] = safe_int(input[py::str(key)]);
    }
    return out;
}

py::object dict_get(const py::dict& values, const char* key) {
    return values.attr("get")(py::str(key), py::none());
}

py::dict summarize_station_actual_units_by_date_impl(const py::dict& payload) {
    const auto room_id_set = parse_room_id_set(dict_get(payload, "room_ids"));
    std::map<std::string, long long> by_date;

    const py::object station_rows_obj = dict_get(payload, "station_rows");
    if (!station_rows_obj.is_none() && py::isinstance<py::list>(station_rows_obj)) {
        for (auto row_obj : station_rows_obj) {
            if (!py::isinstance<py::dict>(row_obj)) {
                continue;
            }
            const auto row = py::reinterpret_borrow<py::dict>(row_obj);
            const std::string day = normalize_text(dict_get(row, "date"));
            const std::string room_id = normalize_text(dict_get(row, "roomId"));
            if (day.empty() || room_id.empty()) {
                continue;
            }
            if (!room_id_set.empty() && room_id_set.find(room_id) == room_id_set.end()) {
                continue;
            }
            const long long stock_i = int_only(dict_get(row, "stockCount"));
            by_date[day] += std::max(stock_i, 0LL);
        }
    }

    py::dict out;
    out["actual_units_by_date"] = build_sorted_int_map(by_date);
    return out;
}

py::dict summarize_naver_actual_units_by_date_impl(const py::dict& payload) {
    const auto room_id_set = parse_room_id_set(dict_get(payload, "room_ids"));
    std::map<std::string, long long> by_date;

    const py::object current_by_room_obj = dict_get(payload, "current_by_room");
    if (!current_by_room_obj.is_none() && py::isinstance<py::dict>(current_by_room_obj)) {
        const auto current_by_room = py::reinterpret_borrow<py::dict>(current_by_room_obj);
        for (auto room_item : current_by_room) {
            const std::string rid = normalize_text(room_item.first);
            if (!room_id_set.empty() && room_id_set.find(rid) == room_id_set.end()) {
                continue;
            }
            if (!py::isinstance<py::dict>(room_item.second)) {
                continue;
            }
            const auto room_map = py::reinterpret_borrow<py::dict>(room_item.second);
            for (auto day_item : room_map) {
                const std::string day = normalize_text(day_item.first);
                if (day.empty() || !py::isinstance<py::dict>(day_item.second)) {
                    continue;
                }
                const auto payload_by_day = py::reinterpret_borrow<py::dict>(day_item.second);
                const long long stock_i = int_only(dict_get(payload_by_day, "stock"));
                by_date[day] += std::max(stock_i, 0LL);
            }
        }
    }

    py::dict out;
    out["actual_units_by_date"] = build_sorted_int_map(by_date);
    return out;
}

py::dict build_provider_reconciliation_impl(const py::dict& payload) {
    const std::string provider_key = payload.contains("provider_key")
        ? py::str(payload["provider_key"]).cast<std::string>()
        : std::string();

    const auto desired = parse_sorted_int_map(dict_get(payload, "desired_units_by_date"));
    const auto actual = parse_sorted_int_map(dict_get(payload, "actual_units_by_date"));

    std::set<std::string> dates;
    for (const auto& [day, _] : desired) {
        dates.insert(day);
    }
    for (const auto& [day, _] : actual) {
        dates.insert(day);
    }

    py::dict action_stats_by_date;
    if (payload.contains("action_stats_by_date") && py::isinstance<py::dict>(payload["action_stats_by_date"])) {
        action_stats_by_date = py::reinterpret_borrow<py::dict>(payload["action_stats_by_date"]);
        for (auto item : action_stats_by_date) {
            dates.insert(py::str(item.first).cast<std::string>());
        }
    }

    py::list rows;
    long long drift_dates = 0;
    long long action_dates = 0;
    long long total_actions = 0;

    for (const auto& day : dates) {
        const long long desired_units = desired.count(day) ? desired.at(day) : 0;
        const long long actual_units = actual.count(day) ? actual.at(day) : 0;
        const long long drift_units = desired_units - actual_units;

        py::dict action_stats;
        if (!action_stats_by_date.is_none() && action_stats_by_date.contains(py::str(day))) {
            const py::handle value = action_stats_by_date[py::str(day)];
            if (py::isinstance<py::dict>(value)) {
                action_stats = py::reinterpret_borrow<py::dict>(value);
            }
        }

        const long long action_count = safe_int(dict_get(action_stats, "action_count"));
        const long long stock_actions = safe_int(dict_get(action_stats, "stock_actions"));
        const long long sale_day_actions = safe_int(dict_get(action_stats, "sale_day_actions"));
        const long long mismatch_signals = safe_int(dict_get(action_stats, "mismatch_signals"));

        if (drift_units != 0) {
            drift_dates += 1;
        }
        if (action_count > 0) {
            action_dates += 1;
        }
        total_actions += action_count;

        py::dict row;
        row["date"] = py::str(day);
        row["desired_units"] = py::int_(desired_units);
        row["actual_units"] = py::int_(actual_units);
        row["drift_units"] = py::int_(drift_units);
        row["action_count"] = py::int_(action_count);
        row["stock_actions"] = py::int_(stock_actions);
        row["sale_day_actions"] = py::int_(sale_day_actions);
        row["mismatch_signals"] = py::int_(mismatch_signals);
        rows.append(row);
    }

    py::dict counts;
    counts["dates"] = py::int_(rows.size());
    counts["drift_dates"] = py::int_(drift_dates);
    counts["action_dates"] = py::int_(action_dates);
    counts["actions"] = py::int_(total_actions);

    py::dict out;
    out["provider"] = py::str(to_upper_copy(normalize_text(py::str(provider_key))));
    out["mode"] = py::str("full_recalc_diff");
    out["desired_units_by_date"] = build_sorted_int_map(desired);
    out["actual_units_by_date"] = build_sorted_int_map(actual);
    out["rows"] = rows;
    out["counts"] = counts;
    return out;
}

}  // namespace

py::dict reconciliation_compute(const py::dict& payload) {
    const std::string op = normalize_text(dict_get(payload, "op"));

    if (op == "summarize_station_actual_units_by_date") {
        return summarize_station_actual_units_by_date_impl(payload);
    }
    if (op == "summarize_naver_actual_units_by_date") {
        return summarize_naver_actual_units_by_date_impl(payload);
    }
    if (op == "build_provider_reconciliation") {
        return build_provider_reconciliation_impl(payload);
    }

    throw std::runtime_error("reconciliation_compute: unsupported op");
}

}  // namespace inventory_core
