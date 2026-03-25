from fastapi import APIRouter, Query
from database import supabase
from datetime import date, timedelta
import calendar as cal_module

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
    # Start from the Monday of the week containing the 1st — even if in the previous month
    first_monday = first_day - timedelta(days=first_day.weekday())
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


@router.get("/{year}/{month}")
def get_calendar(year: int, month: int, person_id: str = Query(...), from_week: int = Query(default=1, ge=1, le=5)):
    # Person info
    person_res = supabase.table("people").select("id, name").eq("id", person_id).single().execute()
    person = person_res.data

    # Schedule
    schedule_res = supabase.table("person_schedule").select("day_of_week, hours").eq("person_id", person_id).execute()
    schedule = {row["day_of_week"]: row["hours"] for row in schedule_res.data if row["hours"] > 0}
    weekly_total = sum(schedule.values())

    # W1 / W234 distributions
    dist_res = supabase.table("task_distribution").select(
        "week_type, task_id, hours_per_week, tasks(id, name, color)"
    ).eq("person_id", person_id).execute()

    distributions: dict[str, list] = {}
    for row in dist_res.data:
        wt = row["week_type"]
        if wt not in distributions:
            distributions[wt] = []
        distributions[wt].append({
            "task_id":        row["task_id"],
            "task_name":      row["tasks"]["name"],
            "task_color":     row["tasks"].get("color"),
            "hours_per_week": row["hours_per_week"],
        })

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
        week_type      = "W1" if i == 0 else "W234"
        tasks_for_week = distributions.get(week_type, [])
        task_map       = {t["task_id"]: t for t in tasks_for_week}

        # Only pass days that fall within this month to the distributor
        week_schedule = {
            dow: hrs
            for dow, hrs in schedule.items()
            if (monday + timedelta(days=dow - 1)).month == month
        }

        week_number = i + 1
        if week_number >= from_week:
            allocations = distribute_week(tasks_for_week, week_schedule, person["name"])
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
                "week_number":      week_number,
                "week_type":        week_type,
                "rules_applied":    week_number >= from_week,
                "week_start":  str(monday),
                "total_hours": week_total,
                "days":        days,
            })

    return {
        "person_id":    person_id,
        "person_name":  person["name"],
        "year":         year,
        "month":        month,
        "weekly_total": weekly_total,
        "weeks":        weeks,
    }
