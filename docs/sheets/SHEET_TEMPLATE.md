# Sheet Template (No Auto Write)

This tool does not write template cells into Google Sheets automatically.
Use copy/paste only.

## 1) SCAN_CONFIG template

- Suggested range: `A1:C40`
- Named range (optional): `SCAN_CONFIG`
- Paste TSV:

```tsv
key	value	note
mode	manual	manual or auto
date_row	65	date header row
weekday_row	66	weekday row
date_start_col	C	start column
date_end_col	BA	end column
room_start_row	67	room list start row
urban_start_row		optional Urban type start row
urban_end_row		optional Urban type end row
double_twin_start_row		optional Double Twin type start row
double_twin_end_row		optional Double Twin type end row
grand_start_row		optional Grand type start row
grand_end_row		optional Grand type end row
inventory_search_start_row	67	inventory scan start row
station_inventory_row		optional fixed station inventory row
naver_inventory_row		optional fixed naver inventory row
```

## 2) ROOM_MAP template

- Suggested range: `E1:G400`
- Named range (optional): `ROOM_MAP`
- Header must include `room_no` and `room_type`.

```tsv
room_no	room_type	note
201	Urban Spa Suite 6인	
301	Urban Spa Suite 6인	
...	...	
A1201	Grand Spa Suite 8인	
```

## 3) In-app quick copy

- Open extension panel
- Open scan settings (`⚙`)
- Click:
  - `SCAN_CONFIG 복사`
  - `ROOM_MAP 복사`
- Paste into your sheet
