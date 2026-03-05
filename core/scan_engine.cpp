#include "scan_engine.hpp"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <iomanip>
#include <optional>
#include <regex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <tuple>
#include <utility>
#include <vector>

namespace py = pybind11;

namespace inventory_core {

namespace {

std::string normalize_text_copy(const std::string& value) {
    std::string out;
    out.reserve(value.size());

    bool seen_non_space = false;
    bool pending_space = false;

    for (unsigned char c : value) {
        if (std::isspace(c) != 0) {
            if (seen_non_space) {
                pending_space = true;
            }
            continue;
        }
        if (pending_space) {
            out.push_back(' ');
            pending_space = false;
        }
        out.push_back(static_cast<char>(c));
        seen_non_space = true;
    }

    return out;
}

std::string to_upper_copy(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char c) {
        return static_cast<char>(std::toupper(c));
    });
    return value;
}

py::object dict_get(const py::dict& values, const char* key) {
    return values.attr("get")(py::str(key), py::none());
}

std::string normalize_text_handle(const py::handle& value) {
    if (value.is_none()) {
        return "";
    }
    const py::object obj = py::reinterpret_borrow<py::object>(value);
    return normalize_text_copy(py::str(obj).cast<std::string>());
}

std::string string_handle(const py::handle& value) {
    if (value.is_none()) {
        return "";
    }
    const py::object obj = py::reinterpret_borrow<py::object>(value);
    return py::str(obj).cast<std::string>();
}

long long safe_int(const py::handle& value, long long default_value = 0) {
    if (value.is_none()) {
        return default_value;
    }
    if (py::isinstance<py::int_>(value)) {
        return value.cast<long long>();
    }
    try {
        const py::object obj = py::reinterpret_borrow<py::object>(value);
        return py::int_(obj).cast<long long>();
    } catch (...) {
        return default_value;
    }
}

double safe_double(const py::handle& value, double default_value = 0.0) {
    if (value.is_none()) {
        return default_value;
    }
    try {
        const py::object obj = py::reinterpret_borrow<py::object>(value);
        return py::cast<double>(obj);
    } catch (...) {
        return default_value;
    }
}

std::string color_to_hex(const py::handle& color) {
    if (color.is_none() || !py::isinstance<py::dict>(color)) {
        return "";
    }

    const auto color_map = py::reinterpret_borrow<py::dict>(color);
    const double red = safe_double(dict_get(color_map, "red"), 0.0);
    const double green = safe_double(dict_get(color_map, "green"), 0.0);
    const double blue = safe_double(dict_get(color_map, "blue"), 0.0);

    const auto clamp_channel = [](double channel) {
        long long scaled = static_cast<long long>(std::llround(channel * 255.0));
        if (scaled < 0) {
            scaled = 0;
        } else if (scaled > 255) {
            scaled = 255;
        }
        return static_cast<int>(scaled);
    };

    std::ostringstream oss;
    oss << std::hex << std::setfill('0') << std::nouppercase << std::setw(2) << clamp_channel(red)
        << std::setw(2) << clamp_channel(green) << std::setw(2) << clamp_channel(blue);
    return oss.str();
}

bool is_leap_year(int year) {
    return ((year % 4) == 0 && (year % 100) != 0) || ((year % 400) == 0);
}

int days_in_month(int year, int month) {
    static const int kDays[12] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
    if (month < 1 || month > 12) {
        return 0;
    }
    if (month == 2 && is_leap_year(year)) {
        return 29;
    }
    return kDays[month - 1];
}

bool parse_iso_date(const std::string& text, int& year, int& month, int& day) {
    static const std::regex kIsoRe(R"(^\s*(\d{4})-(\d{2})-(\d{2})\s*$)");
    std::smatch m;
    if (!std::regex_match(text, m, kIsoRe)) {
        return false;
    }
    try {
        year = std::stoi(m[1].str());
        month = std::stoi(m[2].str());
        day = std::stoi(m[3].str());
    } catch (...) {
        return false;
    }
    const int dim = days_in_month(year, month);
    return dim > 0 && day >= 1 && day <= dim;
}

std::string format_iso_date(int year, int month, int day) {
    std::ostringstream oss;
    oss << std::setfill('0') << std::setw(4) << year << '-' << std::setw(2) << month << '-' << std::setw(2)
        << day;
    return oss.str();
}

bool parse_date_label(const std::string& label, int year, std::string& iso_out) {
    const std::string text = normalize_text_copy(label);
    if (text.empty()) {
        return false;
    }

    static const std::regex kBasicRe(R"(^\s*(\d{1,2})\s*[/\.-]\s*(\d{1,2})\s*$)");
    static const std::regex kKoRe(u8R"(^\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*$)");

    std::smatch m;
    int month = 0;
    int day = 0;

    if (std::regex_match(text, m, kBasicRe) || std::regex_match(text, m, kKoRe)) {
        try {
            month = std::stoi(m[1].str());
            day = std::stoi(m[2].str());
        } catch (...) {
            return false;
        }
    } else {
        return false;
    }

    const int dim = days_in_month(year, month);
    if (dim <= 0 || day < 1 || day > dim) {
        return false;
    }

    iso_out = format_iso_date(year, month, day);
    return true;
}

long long days_from_civil(int year, unsigned month, unsigned day) {
    year -= month <= 2;
    const int era = (year >= 0 ? year : year - 399) / 400;
    const unsigned yoe = static_cast<unsigned>(year - era * 400);
    const unsigned doy = (153U * (month + (month > 2 ? static_cast<unsigned>(-3) : 9U)) + 2U) / 5U + day - 1U;
    const unsigned doe = yoe * 365U + yoe / 4U - yoe / 100U + doy;
    return static_cast<long long>(era) * 146097LL + static_cast<long long>(doe) - 719468LL;
}

std::tuple<int, unsigned, unsigned> civil_from_days(long long z) {
    z += 719468LL;
    const long long era = (z >= 0 ? z : z - 146096LL) / 146097LL;
    const unsigned doe = static_cast<unsigned>(z - era * 146097LL);
    const unsigned yoe = (doe - doe / 1460U + doe / 36524U - doe / 146096U) / 365U;
    int year = static_cast<int>(yoe) + static_cast<int>(era) * 400;
    const unsigned doy = doe - (365U * yoe + yoe / 4U - yoe / 100U);
    const unsigned mp = (5U * doy + 2U) / 153U;
    const unsigned day = doy - (153U * mp + 2U) / 5U + 1U;
    const unsigned month = mp + (mp < 10U ? 3U : static_cast<unsigned>(-9));
    year += month <= 2;
    return std::make_tuple(year, month, day);
}

std::string add_days_iso(const std::string& iso_date, int delta_days) {
    int year = 0;
    int month = 0;
    int day = 0;
    if (!parse_iso_date(iso_date, year, month, day)) {
        return "";
    }
    const long long z = days_from_civil(year, static_cast<unsigned>(month), static_cast<unsigned>(day));
    const auto [ny, nm, nd] = civil_from_days(z + static_cast<long long>(delta_days));
    return format_iso_date(ny, static_cast<int>(nm), static_cast<int>(nd));
}

std::optional<long long> parse_money_to_int(const std::string& value) {
    std::string digits;
    digits.reserve(value.size());
    for (char c : value) {
        if (std::isdigit(static_cast<unsigned char>(c)) != 0) {
            digits.push_back(c);
            continue;
        }
        if (c == '-' && digits.empty()) {
            digits.push_back(c);
        }
    }
    if (digits.empty() || digits == "-") {
        return std::nullopt;
    }
    try {
        return std::stoll(digits);
    } catch (...) {
        return std::nullopt;
    }
}

std::string get_formatted_text(const py::dict& formatted_rows, int row, int col) {
    py::object row_obj = py::none();
    const py::int_ row_i(row);
    const py::str row_s(std::to_string(row));
    if (formatted_rows.contains(row_i)) {
        row_obj = formatted_rows[row_i];
    } else if (formatted_rows.contains(row_s)) {
        row_obj = formatted_rows[row_s];
    }
    if (row_obj.is_none() || !py::isinstance<py::dict>(row_obj)) {
        return "";
    }

    const auto row_map = py::reinterpret_borrow<py::dict>(row_obj);
    py::object value_obj = py::none();
    const py::int_ col_i(col);
    const py::str col_s(std::to_string(col));
    if (row_map.contains(col_i)) {
        value_obj = row_map[col_i];
    } else if (row_map.contains(col_s)) {
        value_obj = row_map[col_s];
    }
    return normalize_text_handle(value_obj);
}

py::dict build_cells_impl(const py::dict& payload) {
    const int start_row = static_cast<int>(safe_int(dict_get(payload, "start_row"), 0));
    const int start_col = static_cast<int>(safe_int(dict_get(payload, "start_col"), 0));

    int max_row = start_row;
    int max_col = start_col;
    py::list cells;

    const py::object row_data_obj = dict_get(payload, "row_data");
    if (!row_data_obj.is_none() && (py::isinstance<py::list>(row_data_obj) || py::isinstance<py::tuple>(row_data_obj))) {
        int row_offset = 0;
        for (auto row_item : row_data_obj) {
            const int abs_row = start_row + row_offset;
            max_row = std::max(max_row, abs_row);

            py::object values_obj = py::none();
            if (py::isinstance<py::dict>(row_item)) {
                const auto row_map = py::reinterpret_borrow<py::dict>(row_item);
                values_obj = dict_get(row_map, "values");
            }

            if (!values_obj.is_none() && (py::isinstance<py::list>(values_obj) || py::isinstance<py::tuple>(values_obj))) {
                int col_offset = 0;
                for (auto value_item : values_obj) {
                    const int abs_col = start_col + col_offset;

                    std::string formatted;
                    std::string note;
                    py::object background = py::none();

                    if (py::isinstance<py::dict>(value_item)) {
                        const auto value_map = py::reinterpret_borrow<py::dict>(value_item);
                        formatted = normalize_text_handle(dict_get(value_map, "formattedValue"));
                        note = string_handle(dict_get(value_map, "note"));

                        const py::object eff_obj = dict_get(value_map, "effectiveFormat");
                        if (!eff_obj.is_none() && py::isinstance<py::dict>(eff_obj)) {
                            const auto eff_map = py::reinterpret_borrow<py::dict>(eff_obj);
                            const py::object cand = dict_get(eff_map, "backgroundColor");
                            if (!cand.is_none()) {
                                background = cand;
                            }
                        }

                        if (background.is_none()) {
                            const py::object uef_obj = dict_get(value_map, "userEnteredFormat");
                            if (!uef_obj.is_none() && py::isinstance<py::dict>(uef_obj)) {
                                const auto uef_map = py::reinterpret_borrow<py::dict>(uef_obj);
                                const py::object cand = dict_get(uef_map, "backgroundColor");
                                if (!cand.is_none()) {
                                    background = cand;
                                }
                            }
                        }
                    }

                    const std::string background_hex = color_to_hex(background);

                    py::dict out_cell;
                    out_cell[py::str("row")] = py::int_(abs_row);
                    out_cell[py::str("col")] = py::int_(abs_col);
                    out_cell[py::str("formatted_value")] = py::str(formatted);
                    out_cell[py::str("note")] = py::str(note);
                    out_cell[py::str("background_color")] = background;
                    if (background_hex.empty()) {
                        out_cell[py::str("background_hex")] = py::none();
                    } else {
                        out_cell[py::str("background_hex")] = py::str(background_hex);
                    }
                    cells.append(out_cell);

                    max_col = std::max(max_col, abs_col);
                    col_offset += 1;
                }
            }

            row_offset += 1;
        }
    }

    py::dict out;
    out[py::str("max_row")] = py::int_(max_row);
    out[py::str("max_col")] = py::int_(max_col);
    out[py::str("cells")] = cells;
    return out;
}

struct DateColumnCandidate {
    int col = 0;
    std::string iso_date;
    std::string label;
    std::string weekday;
};

py::dict find_date_columns_impl(const py::dict& payload) {
    const int start_row = static_cast<int>(safe_int(dict_get(payload, "start_row"), 0));
    const int max_row = static_cast<int>(safe_int(dict_get(payload, "max_row"), start_row));
    const int max_col = static_cast<int>(safe_int(dict_get(payload, "max_col"), 0));
    const int year = static_cast<int>(safe_int(dict_get(payload, "year"), 0));

    const int date_header_hint_row = static_cast<int>(safe_int(dict_get(payload, "date_header_hint_row"), 0));
    const int date_header_hint_col = static_cast<int>(safe_int(dict_get(payload, "date_header_hint_col"), 0));
    const int date_weekday_hint_row = static_cast<int>(safe_int(dict_get(payload, "date_weekday_hint_row"), 0));

    py::dict formatted_rows;
    const py::object formatted_rows_obj = dict_get(payload, "formatted_rows");
    if (!formatted_rows_obj.is_none() && py::isinstance<py::dict>(formatted_rows_obj)) {
        formatted_rows = py::reinterpret_borrow<py::dict>(formatted_rows_obj);
    }

    const auto build_cols_for_row = [&](int row) {
        std::vector<DateColumnCandidate> cols;
        cols.reserve(static_cast<size_t>(std::max(0, max_col - 1)));
        for (int col = 2; col <= max_col; col += 1) {
            const std::string label = get_formatted_text(formatted_rows, row, col);
            std::string iso;
            if (!parse_date_label(label, year, iso)) {
                continue;
            }
            DateColumnCandidate item;
            item.col = col;
            item.label = label;
            item.iso_date = iso;
            cols.push_back(item);
        }
        return cols;
    };

    std::vector<DateColumnCandidate> selected;
    int selected_row = -1;

    std::string hinted_iso;
    const std::string hinted_text = get_formatted_text(formatted_rows, date_header_hint_row, date_header_hint_col);
    if (parse_date_label(hinted_text, year, hinted_iso)) {
        auto hinted_cols = build_cols_for_row(date_header_hint_row);
        if (hinted_cols.size() >= 7U) {
            for (auto& item : hinted_cols) {
                item.weekday = get_formatted_text(formatted_rows, date_weekday_hint_row, item.col);
            }
            selected = std::move(hinted_cols);
            selected_row = date_header_hint_row;
        }
    }

    if (selected_row < 0) {
        for (int row = start_row; row <= max_row; row += 1) {
            auto cols = build_cols_for_row(row);
            if (cols.size() > selected.size()) {
                selected = std::move(cols);
                selected_row = row;
            }
        }

        if (selected_row >= 0) {
            const int weekday_row = selected_row + 1;
            for (auto& item : selected) {
                item.weekday = get_formatted_text(formatted_rows, weekday_row, item.col);
            }
        }
    }

    std::sort(selected.begin(), selected.end(), [](const DateColumnCandidate& a, const DateColumnCandidate& b) {
        return a.col < b.col;
    });

    py::list cols_out;
    for (const auto& item : selected) {
        py::dict row;
        row[py::str("col")] = py::int_(item.col);
        row[py::str("date")] = py::str(item.iso_date);
        row[py::str("label")] = py::str(item.label);
        row[py::str("weekday_label")] = py::str(item.weekday);
        cols_out.append(row);
    }

    py::dict out;
    out[py::str("row")] = py::int_(selected_row);
    out[py::str("cols")] = cols_out;
    return out;
}

struct RunState {
    int row = 0;
    int start_col = 0;
    int end_col = 0;
    std::string start_date;
    std::vector<int> source_columns;
    std::string reservation_no;
    std::string reservation_key;
    std::string channel;
    std::string note;
    std::string color_hex;
    std::string formatted_value;
    std::string room_type;
    std::string room_no;
    std::string branch;
};

struct BlockOut {
    int row = 0;
    int start_col = 0;
    int end_col = 0;
    std::string checkin;
    std::string checkout;
    int nights = 0;
    std::optional<long long> price;
    std::string note;
    std::string reservation_no;
    std::string reservation_key;
    std::string branch;
    std::string channel;
    std::string color_hex;
    std::string room_type;
    std::string room_no;
    std::vector<int> source_columns;
};

void flush_run(std::optional<RunState>& run, std::vector<BlockOut>& blocks) {
    if (!run.has_value()) {
        return;
    }

    RunState state = *run;
    run.reset();

    if (state.source_columns.empty()) {
        return;
    }

    const int nights = static_cast<int>(state.source_columns.size());
    if (nights <= 0) {
        return;
    }

    int year = 0;
    int month = 0;
    int day = 0;
    if (!parse_iso_date(state.start_date, year, month, day)) {
        return;
    }

    const std::string checkout = add_days_iso(state.start_date, nights);
    if (checkout.empty()) {
        return;
    }

    BlockOut out;
    out.row = state.row;
    out.start_col = state.start_col;
    out.end_col = state.end_col;
    out.checkin = state.start_date;
    out.checkout = checkout;
    out.nights = nights;
    out.price = parse_money_to_int(state.formatted_value);
    out.note = state.note;
    out.reservation_no = state.reservation_no;
    out.reservation_key = state.reservation_key;
    out.branch = state.branch;
    out.channel = state.channel;
    out.color_hex = state.color_hex;
    out.room_type = state.room_type;
    out.room_no = state.room_no;
    out.source_columns = std::move(state.source_columns);

    blocks.push_back(std::move(out));
}

py::dict detect_block_runs_impl(const py::dict& payload) {
    py::list events_by_row;
    const py::object events_obj = dict_get(payload, "events_by_row");
    if (!events_obj.is_none() && (py::isinstance<py::list>(events_obj) || py::isinstance<py::tuple>(events_obj))) {
        events_by_row = py::reinterpret_borrow<py::list>(events_obj);
    }

    std::vector<BlockOut> blocks;

    for (auto row_item : events_by_row) {
        if (!py::isinstance<py::dict>(row_item)) {
            continue;
        }
        const auto row_map = py::reinterpret_borrow<py::dict>(row_item);

        const int row = static_cast<int>(safe_int(dict_get(row_map, "row"), -1));
        const std::string room_type = normalize_text_handle(dict_get(row_map, "room_type"));
        const std::string room_no = normalize_text_handle(dict_get(row_map, "room_no"));
        const std::string branch = normalize_text_handle(dict_get(row_map, "branch"));

        py::list cells;
        const py::object cells_obj = dict_get(row_map, "cells");
        if (!cells_obj.is_none() && (py::isinstance<py::list>(cells_obj) || py::isinstance<py::tuple>(cells_obj))) {
            cells = py::reinterpret_borrow<py::list>(cells_obj);
        }

        std::optional<RunState> current_run;

        for (auto cell_item : cells) {
            if (!py::isinstance<py::dict>(cell_item)) {
                continue;
            }
            const auto cell_map = py::reinterpret_borrow<py::dict>(cell_item);

            const int col = static_cast<int>(safe_int(dict_get(cell_map, "col"), -1));
            const std::string date_iso = normalize_text_handle(dict_get(cell_map, "date"));
            const std::string status = to_upper_copy(normalize_text_handle(dict_get(cell_map, "status")));
            const std::string reservation_key = normalize_text_handle(dict_get(cell_map, "reservation_key"));
            const std::string reservation_no = normalize_text_handle(dict_get(cell_map, "reservation_no"));
            const std::string channel = normalize_text_handle(dict_get(cell_map, "channel"));
            const std::string note = string_handle(dict_get(cell_map, "note"));
            const std::string color_hex = normalize_text_handle(dict_get(cell_map, "color_hex"));
            const std::string formatted_value = normalize_text_handle(dict_get(cell_map, "formatted_value"));

            const bool occupied_keyed = (status == "OCCUPIED") && !reservation_key.empty();
            if (occupied_keyed) {
                if (current_run.has_value() && current_run->row == row && current_run->reservation_key == reservation_key) {
                    current_run->end_col = col;
                    current_run->source_columns.push_back(col);
                    if (current_run->reservation_no.empty() && !reservation_no.empty()) {
                        current_run->reservation_no = reservation_no;
                    }
                    if (current_run->channel.empty() && !channel.empty()) {
                        current_run->channel = channel;
                    }
                } else {
                    flush_run(current_run, blocks);

                    RunState next;
                    next.row = row;
                    next.start_col = col;
                    next.end_col = col;
                    next.start_date = date_iso;
                    next.source_columns = {col};
                    next.reservation_no = reservation_no;
                    next.reservation_key = reservation_key;
                    next.channel = channel;
                    next.note = note;
                    next.color_hex = color_hex;
                    next.formatted_value = formatted_value;
                    next.room_type = room_type;
                    next.room_no = room_no;
                    next.branch = branch;

                    current_run = std::move(next);
                }
            } else {
                flush_run(current_run, blocks);
            }
        }

        flush_run(current_run, blocks);
    }

    std::sort(blocks.begin(), blocks.end(), [](const BlockOut& a, const BlockOut& b) {
        if (a.row != b.row) {
            return a.row < b.row;
        }
        if (a.start_col != b.start_col) {
            return a.start_col < b.start_col;
        }
        return a.end_col < b.end_col;
    });

    py::list blocks_out;
    for (const auto& block : blocks) {
        py::dict row;
        row[py::str("row")] = py::int_(block.row);
        row[py::str("room_type")] = py::str(block.room_type);
        row[py::str("room_no")] = py::str(block.room_no);
        row[py::str("start_col")] = py::int_(block.start_col);
        row[py::str("end_col")] = py::int_(block.end_col);
        row[py::str("checkin")] = py::str(block.checkin);
        row[py::str("checkout")] = py::str(block.checkout);
        row[py::str("nights")] = py::int_(block.nights);
        if (block.price.has_value()) {
            row[py::str("price")] = py::int_(*block.price);
        } else {
            row[py::str("price")] = py::none();
        }
        row[py::str("note")] = py::str(block.note);
        if (block.reservation_no.empty()) {
            row[py::str("reservation_no")] = py::none();
        } else {
            row[py::str("reservation_no")] = py::str(block.reservation_no);
        }
        if (block.reservation_key.empty()) {
            row[py::str("reservation_key")] = py::none();
        } else {
            row[py::str("reservation_key")] = py::str(block.reservation_key);
        }
        row[py::str("branch")] = py::str(block.branch);
        row[py::str("channel")] = py::str(block.channel);
        row[py::str("platform")] = py::str(block.channel);
        if (block.color_hex.empty()) {
            row[py::str("color_hex")] = py::none();
        } else {
            row[py::str("color_hex")] = py::str(block.color_hex);
        }

        py::list source_columns;
        for (int col : block.source_columns) {
            source_columns.append(py::int_(col));
        }
        row[py::str("source_columns")] = source_columns;

        blocks_out.append(row);
    }

    py::dict out;
    out[py::str("blocks")] = blocks_out;
    return out;
}

}  // namespace

py::dict scan_compute(const py::dict& payload) {
    const std::string op = normalize_text_handle(dict_get(payload, "op"));
    if (op == "build_cells") {
        return build_cells_impl(payload);
    }
    if (op == "find_date_columns") {
        return find_date_columns_impl(payload);
    }
    if (op == "detect_block_runs") {
        return detect_block_runs_impl(payload);
    }
    throw std::runtime_error("scan_compute: unsupported op");
}

}  // namespace inventory_core
