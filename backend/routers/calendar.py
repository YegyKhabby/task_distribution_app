from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from database import supabase
from datetime import date, timedelta
from io import BytesIO
import calendar as cal_module
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

router = APIRouter(prefix="/calendar", tags=["calendar"])

DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"]


def round_half(x: float) -> float:
    return round(x * 2) / 2


def norm(name: str) -> str:
    return name.lower().strip()


# ── Task category sets (normalized names) ────────────────────────────────────

SINGLE_DAY_TASKS = {
    "amazon",
    "confluence",
    "cc anastasia",
    "credit card anastasia",
    "logo and license invoice",
}

REMINDER_TASKS = {
    "reminder and pre-collection",
    "reminder and pre collection",
}

TWO_DAY_TASKS = {"debt collection", "opos"}

POP_TASKS = {"pops & follow-up", "pops & follow up"}

DAILY_COVERAGE_TASKS = {
    "vendor forms & cor tax forms",
    "credit cards",
    "data cleaning",
}

EVEN_SPREAD_TASKS = {"freshdesk sorting"}

FILL_TASKS = {"freshdesk reply"}

# Info telephone: allowed weekdays per person (0-indexed: 0=Mon … 4=Fri)
INFO_TELEPHONE_SCHEDULE = {
    "can":     {0, 4},
    "anisha":  {0},
    "rohit":   {0, 1, 2, 3},
    "yeganeh": {1},
    "ayesha":  {3, 4},
}

# Processing priority (lower number = allocated first)
TASK_PRIORITY = {
    "info telephone":            1,
    "cb":                        2,
    "travel reports + integrity": 3,
    "vendor forms & cor tax forms": 4,
    "data cleaning":             5,
    "credit cards":              6,
    "opos":                      7,
    "reminder and pre-collection": 8,
    "reminder and pre collection": 8,
    "freshdesk sorting":         9,
    "aps can and sidrit":        10,
    "aps yeganeh and moinul":    11,
    "freshdesk reply":           999,
}


def get_priority(task_name: str) -> int:
    return TASK_PRIORITY.get(norm(task_name), 50)


# ── Distribution engine ───────────────────────────────────────────────────────

def distribute_week(
    tasks: list[dict],       # [{task_id, task_name, task_color, hours_per_week}]
    schedule: dict,          # {dow (1–5): hours}  — only non-zero days
    person_name: str,
    preferred_days: dict = None,  # {task_id: preferred_dow (1–5)} — overrides category rules
) -> dict:                   # {dow: {task_id: hours}}
    """
    Distribute one person's weekly task hours across their work days
    following the same rules as taskauto.py.
    """
    work_dows = sorted(schedule.keys())
    if not work_dows or not tasks:
        return {dow: {} for dow in work_dows}

    day_capacity = {dow: schedule[dow] for dow in work_dows}
    allocations: dict[int, dict[str, float]] = {dow: {} for dow in work_dows}
    person_norm = norm(person_name)
    is_elza = "elza" in person_norm
    total_sched = sum(schedule[d] for d in work_dows)

    def top_by_capacity(n: int) -> list[int]:
        return sorted(work_dows, key=lambda d: day_capacity[d], reverse=True)[:n]

    def alloc(dow: int, task_id: str, hours: float):
        hours = round_half(hours)
        if hours <= 0:
            return
        allocations[dow][task_id] = allocations[dow].get(task_id, 0.0) + hours
        day_capacity[dow] = max(0.0, day_capacity[dow] - hours)

    sorted_tasks = sorted(tasks, key=lambda t: get_priority(t["task_name"]))
    normal_tasks = [t for t in sorted_tasks if norm(t["task_name"]) not in FILL_TASKS]
    fill_tasks   = [t for t in sorted_tasks if norm(t["task_name"]) in FILL_TASKS]

    for t in normal_tasks:
        tname = norm(t["task_name"])
        tid   = t["task_id"]
        hrs   = t["hours_per_week"]
        if hrs <= 0:
            continue

        # ── Preferred day pin: overrides all category rules ──
        if preferred_days and tid in preferred_days:
            preferred_dow = preferred_days[tid]
            if preferred_dow in work_dows:
                alloc(preferred_dow, tid, hrs)
            else:
                best = top_by_capacity(1)
                if best:
                    alloc(best[0], tid, hrs)
            continue

        # ── Info Telephone: fixed days per person ──
        if "info telephone" in tname:
            allowed_0 = None
            for key, days in INFO_TELEPHONE_SCHEDULE.items():
                if key in person_norm:
                    allowed_0 = days
                    break
            allowed_dows = (
                [d + 1 for d in allowed_0 if (d + 1) in work_dows]
                if allowed_0 else work_dows
            ) or work_dows
            units = round(hrs / 0.5)
            for i in range(units):
                alloc(allowed_dows[i % len(allowed_dows)], tid, 0.5)

        # ── Single-day tasks: all hours on the day with most capacity ──
        elif tname in SINGLE_DAY_TASKS or (tname == "opos" and is_elza):
            best = top_by_capacity(1)
            if best:
                alloc(best[0], tid, hrs)

        # ── Reminder: first working day of the week ──
        elif tname in REMINDER_TASKS:
            alloc(work_dows[0], tid, hrs)

        # ── Two-day split (Debt Collection, OPOs for non-Elza) ──
        elif tname in TWO_DAY_TASKS:
            top2 = top_by_capacity(2)
            if len(top2) >= 2:
                half = round_half(hrs / 2)
                alloc(top2[0], tid, half)
                alloc(top2[1], tid, hrs - half)
            elif top2:
                alloc(top2[0], tid, hrs)

        # ── POPs: 2-day split, expand to 3 if capacity is tight ──
        elif tname in POP_TASKS:
            top2 = top_by_capacity(2)
            if len(top2) >= 2 and sum(day_capacity[d] for d in top2) >= hrs:
                half = round_half(hrs / 2)
                alloc(top2[0], tid, half)
                alloc(top2[1], tid, hrs - half)
            else:
                top3 = top_by_capacity(min(3, len(work_dows)))
                rem = hrs
                for i, dow in enumerate(top3):
                    day_hrs = round_half(hrs / len(top3)) if i < len(top3) - 1 else round_half(rem)
                    alloc(dow, tid, day_hrs)
                    rem = round_half(rem - day_hrs)

        # ── Even spread: Freshdesk Sorting ──
        elif tname in EVEN_SPREAD_TASKS:
            rem = hrs
            for i, dow in enumerate(work_dows):
                day_hrs = round_half(hrs / len(work_dows)) if i < len(work_dows) - 1 else round_half(rem)
                alloc(dow, tid, day_hrs)
                rem = round_half(rem - day_hrs)

        # ── Default (incl. daily-coverage tasks): proportional to scheduled hours ──
        else:
            rem = hrs
            for i, dow in enumerate(work_dows):
                if i == len(work_dows) - 1:
                    day_hrs = round_half(rem)
                else:
                    day_hrs = round_half(hrs * schedule[dow] / total_sched)
                    rem = round_half(rem - day_hrs)
                alloc(dow, tid, day_hrs)

    # ── Fill tasks (Freshdesk Reply): absorb remaining daily capacity ──
    for t in fill_tasks:
        tid = t["task_id"]
        for dow in work_dows:
            cap = round_half(day_capacity[dow])
            if cap > 0:
                alloc(dow, tid, cap)

    return allocations


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_mondays_in_month(year: int, month: int) -> list[date]:
    first_day = date(year, month, 1)
    last_day  = date(year, month, cal_module.monthrange(year, month)[1])
    # First Monday that actually falls within this month
    first_monday = first_day + timedelta(days=(7 - first_day.weekday()) % 7)
    mondays = []
    current = first_monday
    while current <= last_day:
        mondays.append(current)
        current += timedelta(weeks=1)
    return mondays


# ── Endpoint ──────────────────────────────────────────────────────────────────

def distribute_week_proportional(
    tasks: list[dict],
    schedule: dict,
) -> dict:
    """Simple proportional distribution (no rules) — used for locked weeks."""
    work_dows = sorted(schedule.keys())
    if not work_dows or not tasks:
        return {dow: {} for dow in work_dows}
    total_sched = sum(schedule[d] for d in work_dows)
    allocations: dict[int, dict[str, float]] = {dow: {} for dow in work_dows}
    for t in tasks:
        tid = t["task_id"]
        hrs = t["hours_per_week"]
        if hrs <= 0:
            continue
        rem = hrs
        for i, dow in enumerate(work_dows):
            if i == len(work_dows) - 1:
                day_hrs = round_half(rem)
            else:
                day_hrs = round_half(hrs * schedule[dow] / total_sched)
                rem = round_half(rem - day_hrs)
            if day_hrs > 0:
                allocations[dow][tid] = day_hrs
    return allocations


MONTH_NAMES_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
MONTH_NAMES_LONG  = ["January","February","March","April","May","June",
                      "July","August","September","October","November","December"]
DAY_ABBR = ["Mon","Tue","Wed","Thu","Fri"]


def _compute_day_view(date_obj: date, week_start: int = 1) -> dict:
    """Shared logic for GET /day and GET /day/export."""
    dow = date_obj.weekday() + 1  # 1=Mon … 5=Fri
    monday = date_obj - timedelta(days=date_obj.weekday())
    year, month = date_obj.year, date_obj.month

    # Determine week_number (1–4) relative to the month
    all_mondays = get_mondays_in_month(year, month)
    try:
        i = all_mondays.index(monday)
        wn = ((i + week_start - 1) % 4) + 1
    except ValueError:
        # monday is outside this month (shouldn't happen with new get_mondays_in_month)
        wn = week_start

    # All active people
    people_res = supabase.table("people").select("id, name").eq("active", True).order("name").execute()
    all_people = people_res.data

    # Absent people for this date
    abs_res = supabase.table("absences").select("person_id").eq("date", str(date_obj)).execute()
    absent_ids = {r["person_id"] for r in abs_res.data}

    # Per-person allocations for the day
    # task_id -> {task_name, task_color, responsible_person, people: [{person_name, hours}]}
    task_data: dict[str, dict] = {}

    for person in all_people:
        pid   = person["id"]
        pname = person["name"]

        sched_res = supabase.table("person_schedule").select("day_of_week, hours").eq("person_id", pid).execute()
        schedule  = {r["day_of_week"]: r["hours"] for r in sched_res.data if r["hours"] > 0}

        if not schedule.get(dow, 0) or pid in absent_ids:
            continue  # person doesn't work this day or is absent

        dist_res = supabase.table("task_distribution").select(
            "task_id, hours_per_week, preferred_day, tasks(id, name, color, responsible_person)"
        ).eq("person_id", pid).eq("week_number", wn).execute()

        tasks_list = []
        preferred  = {}
        for row in dist_res.data:
            tasks_list.append({
                "task_id":        row["task_id"],
                "task_name":      row["tasks"]["name"],
                "task_color":     row["tasks"].get("color"),
                "responsible_person": row["tasks"].get("responsible_person"),
                "hours_per_week": row["hours_per_week"],
            })
            if row.get("preferred_day"):
                preferred[row["task_id"]] = row["preferred_day"]

        week_sched = {
            d: h for d, h in schedule.items()
            if (monday + timedelta(days=d - 1)).month == month or monday.month != month
        }
        alloc = distribute_week(tasks_list, week_sched, pname, preferred)

        for tid, hrs in alloc.get(dow, {}).items():
            if hrs <= 0:
                continue
            task_meta = next((t for t in tasks_list if t["task_id"] == tid), None)
            if not task_meta:
                continue
            if tid not in task_data:
                task_data[tid] = {
                    "task_id":            tid,
                    "task_name":          task_meta["task_name"],
                    "task_color":         task_meta["task_color"],
                    "responsible_person": task_meta["responsible_person"],
                    "total_hours":        0.0,
                    "people":             [],
                }
            task_data[tid]["total_hours"] = round(task_data[tid]["total_hours"] + hrs, 2)
            task_data[tid]["people"].append({"person_name": pname, "hours": hrs})

    tasks_sorted = sorted(task_data.values(), key=lambda t: t["total_hours"], reverse=True)
    absent_names = [p["name"] for p in all_people if p["id"] in absent_ids]
    total_hours  = round(sum(t["total_hours"] for t in tasks_sorted), 2)

    return {
        "date":         str(date_obj),
        "day_name":     DAY_ABBR[date_obj.weekday()],
        "week_number":  wn,
        "tasks":        tasks_sorted,
        "absent_people": absent_names,
        "total_hours":  total_hours,
    }


@router.get("/day")
def get_day_view(date_str: str = Query(..., alias="date"), week_start: int = Query(default=1, ge=1, le=4)):
    """Return all tasks and assigned people with hours for a single day."""
    date_obj = date.fromisoformat(date_str)
    if date_obj.weekday() >= 5:
        return {"date": date_str, "day_name": DAY_ABBR[min(date_obj.weekday(), 4)],
                "week_number": None, "tasks": [], "absent_people": [], "total_hours": 0,
                "is_weekend": True}
    return _compute_day_view(date_obj, week_start)


@router.get("/day/export")
def export_day_excel(date_str: str = Query(..., alias="date"), week_start: int = Query(default=1, ge=1, le=4)):
    """Download an Excel file for a single day — tasks × people."""
    date_obj = date.fromisoformat(date_str)
    view = _compute_day_view(date_obj, week_start)

    # Collect all person names (column headers)
    person_names: list[str] = []
    seen: set[str] = set()
    for t in view["tasks"]:
        for p in t["people"]:
            if p["person_name"] not in seen:
                person_names.append(p["person_name"])
                seen.add(p["person_name"])

    wb = openpyxl.Workbook()
    ws = wb.active
    day_label = f"{view['day_name']} {date_obj.day} {MONTH_NAMES_SHORT[date_obj.month-1]} {date_obj.year}"
    ws.title = day_label[:31]

    HDR_FILL  = PatternFill("solid", fgColor="3730A3")
    BOLD_WHITE = Font(bold=True, color="FFFFFF")
    BOLD      = Font(bold=True)
    centre    = Alignment(horizontal="center")

    # Header
    header = ["Task", "Responsible"] + person_names + ["Total"]
    ws.append(header)
    for col in range(1, len(header) + 1):
        cell = ws.cell(row=1, column=col)
        cell.font = BOLD_WHITE
        cell.fill = HDR_FILL
        cell.alignment = centre

    # Task rows
    for t in view["tasks"]:
        person_hours = {p["person_name"]: p["hours"] for p in t["people"]}
        row = [t["task_name"], t["responsible_person"] or "—"]
        row += [person_hours.get(pname) for pname in person_names]
        row += [t["total_hours"]]
        ws.append(row)
        # Color the task name cell
        if t["task_color"]:
            color = t["task_color"].lstrip("#")
            ws.cell(row=ws.max_row, column=1).fill = PatternFill("solid", fgColor=color)
        ws.cell(row=ws.max_row, column=len(header)).font = BOLD

    # Absent footer
    if view["absent_people"]:
        ws.append([])
        ws.append([f"Absent: {', '.join(view['absent_people'])}"])
        ws.cell(row=ws.max_row, column=1).font = Font(italic=True, color="991B1B")

    # Widths
    ws.column_dimensions["A"].width = 26
    ws.column_dimensions["B"].width = 15
    for col in range(3, len(header) + 1):
        ws.column_dimensions[get_column_letter(col)].width = 10
    ws.freeze_panes = "C2"

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"daily_{date_str}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export")
def export_calendar_excel(year: int = Query(...), month: int = Query(...), week_start: int = Query(default=1, ge=1, le=4)):
    """
    Download an Excel file with all active people's daily task hours for the
    selected month, including the full last working week of the previous month
    as leading columns.
    """
    # ── Previous month ───────────────────────────────────────────────────────
    prev_m = month - 1 if month > 1 else 12
    prev_y = year if month > 1 else year - 1
    prev_last = date(prev_y, prev_m, cal_module.monthrange(prev_y, prev_m)[1])
    last_monday_prev = prev_last - timedelta(days=prev_last.weekday())

    cur_first = date(year, month, 1)
    cur_last  = date(year, month, cal_module.monthrange(year, month)[1])

    # ── Section A: full last Mon–Fri week of previous month ─────────────────
    section_a = [last_monday_prev + timedelta(days=i) for i in range(5)]

    # ── Section B: working days of current month not in section A ────────────
    section_b = []
    all_mondays = get_mondays_in_month(year, month)
    for monday in all_mondays:
        if monday <= last_monday_prev:
            continue
        for dow in range(1, 6):
            d = monday + timedelta(days=dow - 1)
            if d.month == month:
                section_b.append(d)

    all_days = section_a + section_b

    # ── People ───────────────────────────────────────────────────────────────
    people_res = supabase.table("people").select("id, name").eq("active", True).order("name").execute()
    all_people = people_res.data

    # ── Per-person allocations ────────────────────────────────────────────────
    # day_alloc[pid][date_str] = {task_name: hours} | "absent" | None
    person_alloc: dict[str, dict] = {}

    for person in all_people:
        pid   = person["id"]
        pname = person["name"]

        sched_res = supabase.table("person_schedule").select("day_of_week, hours").eq("person_id", pid).execute()
        schedule  = {r["day_of_week"]: r["hours"] for r in sched_res.data if r["hours"] > 0}

        dist_res = supabase.table("task_distribution").select(
            "week_number, task_id, hours_per_week, preferred_day, tasks(id, name, color)"
        ).eq("person_id", pid).execute()

        distributions:    dict[int, list] = {}
        preferred_by_wk:  dict[int, dict] = {}
        for row in dist_res.data:
            wn = row["week_number"]
            distributions.setdefault(wn, []).append({
                "task_id":        row["task_id"],
                "task_name":      row["tasks"]["name"],
                "task_color":     row["tasks"].get("color"),
                "hours_per_week": row["hours_per_week"],
            })
            if row.get("preferred_day"):
                preferred_by_wk.setdefault(wn, {})[row["task_id"]] = row["preferred_day"]

        abs_res = supabase.table("absences").select("date").eq("person_id", pid).gte(
            "date", str(last_monday_prev)
        ).lte("date", str(cur_last)).execute()
        absent = {r["date"] for r in abs_res.data}

        day_alloc: dict[str, object] = {}

        # Section A — use week 4 distribution with the full 5-day schedule
        tasks_a  = distributions.get(4, [])
        tmap_a   = {t["task_id"]: t for t in tasks_a}
        alloc_a  = distribute_week(tasks_a, schedule, pname, preferred_by_wk.get(4))

        for d in section_a:
            d_str = str(d)
            dow   = d.weekday() + 1
            if d_str in absent:
                day_alloc[d_str] = "absent"
            elif schedule.get(dow, 0) > 0:
                day_alloc[d_str] = {
                    tmap_a[tid]["task_name"]: hrs
                    for tid, hrs in alloc_a.get(dow, {}).items()
                    if hrs > 0 and tid in tmap_a
                }
            else:
                day_alloc[d_str] = None

        # Section B — per week, filtered to current month days
        for i, monday in enumerate(all_mondays):
            if monday <= last_monday_prev:
                continue
            wn      = ((i + week_start - 1) % 4) + 1
            tasks_w = distributions.get(wn, [])
            tmap_w  = {t["task_id"]: t for t in tasks_w}
            week_sched = {
                dow: hrs
                for dow, hrs in schedule.items()
                if (monday + timedelta(days=dow - 1)).month == month
            }
            alloc_w = distribute_week(tasks_w, week_sched, pname, preferred_by_wk.get(wn))

            for dow in range(1, 6):
                d = monday + timedelta(days=dow - 1)
                if d.month != month:
                    continue
                d_str = str(d)
                if d_str in absent:
                    day_alloc[d_str] = "absent"
                elif schedule.get(dow, 0) > 0:
                    day_alloc[d_str] = {
                        tmap_w[tid]["task_name"]: hrs
                        for tid, hrs in alloc_w.get(dow, {}).items()
                        if hrs > 0 and tid in tmap_w
                    }
                else:
                    day_alloc[d_str] = None

        person_alloc[pid] = day_alloc

    # ── Build workbook ────────────────────────────────────────────────────────
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"{MONTH_NAMES_LONG[month-1]} {year}"

    # Styles
    HDR_FILL   = PatternFill("solid", fgColor="3730A3")   # dark indigo — header bg
    PREV_FILL  = PatternFill("solid", fgColor="7C3AED")   # purple — prev-month col headers
    ABS_FILL   = PatternFill("solid", fgColor="FCA5A5")   # red — absent cells
    PREV_CELL  = PatternFill("solid", fgColor="EDE9FE")   # very light purple — prev-month data
    ALT_FILL   = PatternFill("solid", fgColor="F1F5F9")   # light gray — alternating person rows
    WHITE_FILL = PatternFill("solid", fgColor="FFFFFF")

    def hdr_font(color="FFFFFF"): return Font(bold=True, color=color)
    centre = Alignment(horizontal="center", vertical="center")

    # Header row
    header = ["Person", "Task"] + [
        f"{DAY_ABBR[d.weekday()]} {d.day} {MONTH_NAMES_SHORT[d.month-1]}"
        for d in all_days
    ]
    ws.append(header)

    for col in range(1, len(header) + 1):
        cell = ws.cell(row=1, column=col)
        cell.font      = hdr_font()
        cell.fill      = HDR_FILL
        cell.alignment = centre

    # Purple tint on section-A date headers
    for col_offset, d in enumerate(all_days):
        if d < cur_first:
            ws.cell(row=1, column=3 + col_offset).fill = PREV_FILL

    # Data rows
    row_num = 2
    for p_idx, person in enumerate(all_people):
        pid       = person["id"]
        pname     = person["name"]
        day_alloc = person_alloc[pid]
        row_fill  = ALT_FILL if p_idx % 2 else WHITE_FILL
        prev_data = PatternFill("solid", fgColor="EDE9FE") if p_idx % 2 else PatternFill("solid", fgColor="F3E8FF")

        # Collect task names in first-appearance order
        task_names: list[str] = []
        seen: set[str] = set()
        for d in all_days:
            td = day_alloc.get(str(d))
            if isinstance(td, dict):
                for tname in td:
                    if tname not in seen:
                        task_names.append(tname)
                        seen.add(tname)

        if not task_names:
            ws.append([pname, "—"] + [None] * len(all_days))
            ws.cell(row=row_num, column=1).font = Font(bold=True)
            row_num += 1
            continue

        for t_idx, tname in enumerate(task_names):
            row_data = [pname if t_idx == 0 else "", tname]
            for d in all_days:
                td = day_alloc.get(str(d))
                if td == "absent":
                    row_data.append("Absent")
                elif isinstance(td, dict):
                    row_data.append(td.get(tname) or None)
                else:
                    row_data.append(None)
            ws.append(row_data)

            # Background colour for person/task label columns
            ws.cell(row=row_num, column=1).fill = row_fill
            ws.cell(row=row_num, column=2).fill = row_fill
            if t_idx == 0:
                ws.cell(row=row_num, column=1).font = Font(bold=True)

            # Day cells
            for col_offset, d in enumerate(all_days):
                cell = ws.cell(row=row_num, column=3 + col_offset)
                td   = day_alloc.get(str(d))
                if td == "absent":
                    cell.fill      = ABS_FILL
                    cell.font      = Font(color="991B1B")
                    cell.alignment = centre
                elif d < cur_first:
                    cell.fill = prev_data
                    cell.alignment = centre
                else:
                    cell.fill      = row_fill
                    cell.alignment = centre

            row_num += 1

    # Column widths & freeze
    ws.column_dimensions["A"].width = 15
    ws.column_dimensions["B"].width = 26
    for col in range(3, len(header) + 1):
        ws.column_dimensions[get_column_letter(col)].width = 8
    ws.freeze_panes = "C2"

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"calendar_{year}_{month:02d}_{MONTH_NAMES_LONG[month-1]}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/{year}/{month}")
def get_calendar(year: int, month: int, person_id: str = Query(...), from_week: int = Query(default=1, ge=1, le=5), week_start: int = Query(default=1, ge=1, le=4)):
    # Person info
    person_res = supabase.table("people").select("id, name").eq("id", person_id).single().execute()
    person = person_res.data

    # Schedule
    schedule_res = supabase.table("person_schedule").select("day_of_week, hours").eq("person_id", person_id).execute()
    schedule = {row["day_of_week"]: row["hours"] for row in schedule_res.data if row["hours"] > 0}
    weekly_total = sum(schedule.values())

    # Per-week distributions (week_number 1–4), including preferred_day
    dist_res = supabase.table("task_distribution").select(
        "week_number, task_id, hours_per_week, preferred_day, tasks(id, name, color)"
    ).eq("person_id", person_id).execute()

    distributions: dict[int, list] = {}
    preferred_days: dict[int, dict] = {}  # {week_number: {task_id: preferred_day}}
    for row in dist_res.data:
        wn = row["week_number"]
        if wn not in distributions:
            distributions[wn] = []
        distributions[wn].append({
            "task_id":        row["task_id"],
            "task_name":      row["tasks"]["name"],
            "task_color":     row["tasks"].get("color"),
            "hours_per_week": row["hours_per_week"],
        })
        if row.get("preferred_day"):
            preferred_days.setdefault(wn, {})[row["task_id"]] = row["preferred_day"]

    # Absences for the month
    first_day = date(year, month, 1)
    last_day  = date(year, month, cal_module.monthrange(year, month)[1])
    absences_res = supabase.table("absences").select("date").eq("person_id", person_id).gte(
        "date", str(first_day)
    ).lte("date", str(last_day)).execute()
    absent_dates = {row["date"] for row in absences_res.data}

    # Build weeks
    mondays = get_mondays_in_month(year, month)
    weeks   = []

    for i, monday in enumerate(mondays):
        week_number    = ((i + week_start - 1) % 4) + 1
        tasks_for_week = distributions.get(week_number, [])
        task_map       = {t["task_id"]: t for t in tasks_for_week}

        # Only pass days that fall within this month to the distributor
        week_schedule = {
            dow: hrs
            for dow, hrs in schedule.items()
            if (monday + timedelta(days=dow - 1)).month == month
        }

        if week_number >= from_week:
            allocations = distribute_week(tasks_for_week, week_schedule, person["name"], preferred_days.get(week_number))
        else:
            allocations = distribute_week_proportional(tasks_for_week, week_schedule)

        days       = []
        week_total = 0.0

        for dow in range(1, 6):
            actual_date = monday + timedelta(days=dow - 1)
            if actual_date.month != month:
                continue

            scheduled_hrs = schedule.get(dow, 0.0)
            is_work_day   = scheduled_hrs > 0
            is_absent     = str(actual_date) in absent_dates

            if is_work_day and not is_absent:
                week_total += scheduled_hrs

            daily_tasks = []
            if is_work_day and not is_absent:
                for task_id, hours in allocations.get(dow, {}).items():
                    if hours > 0 and task_id in task_map:
                        t = task_map[task_id]
                        daily_tasks.append({
                            "task_id":   task_id,
                            "task_name": t["task_name"],
                            "task_color": t["task_color"],
                            "hours":     hours,
                        })

            days.append({
                "date":            str(actual_date),
                "day_of_week":     dow,
                "day_name":        DAY_NAMES[dow - 1],
                "is_work_day":     is_work_day,
                "scheduled_hours": scheduled_hrs,
                "is_absent":       is_absent,
                "tasks":           daily_tasks,
            })

        if days:
            weeks.append({
                "week_number":   week_number,
                "rules_applied": week_number >= from_week,
                "week_start":    str(monday),
                "total_hours":   week_total,
                "days":          days,
            })

    return {
        "person_id":    person_id,
        "person_name":  person["name"],
        "year":         year,
        "month":        month,
        "weekly_total": weekly_total,
        "weeks":        weeks,
    }
