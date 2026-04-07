from fastapi import APIRouter, Query
from fastapi.responses import Response
from database import supabase
from datetime import date, timedelta
from models import ActualHoursCreate, ActualHoursUpdate, CopyWeekRequest
from routers.calendar import distribute_week, get_mondays_in_month
from utils.versioned import active_schedule_rows, active_distribution_rows

router = APIRouter(prefix="/actual", tags=["actual"])


def _week_dates(week_start: date) -> list[date]:
    """Return Mon–Fri dates for the given Monday."""
    return [week_start + timedelta(days=i) for i in range(5)]


def _week_number(week_start: date, week_start_offset: int = 1) -> int:
    """Determine week_number (1–4) for the given Monday using month-based rotation."""
    year, month = week_start.year, week_start.month
    mondays = get_mondays_in_month(year, month)
    try:
        i = mondays.index(week_start)
        return ((i + week_start_offset - 1) % 4) + 1
    except ValueError:
        return week_start_offset


@router.get("")
def get_actual(week_start: str = Query(...)):
    """Return all actual_hours rows for Mon–Fri of the given week."""
    monday = date.fromisoformat(week_start)
    friday = monday + timedelta(days=4)
    res = (
        supabase.table("actual_hours")
        .select("id, person_id, task_id, task_label, date, hours, created_at, people(id, name)")
        .gte("date", str(monday))
        .lte("date", str(friday))
        .order("date")
        .execute()
    )
    return res.data


@router.post("", status_code=201)
def create_actual(body: ActualHoursCreate):
    row = {
        "person_id": body.person_id,
        "task_label": body.task_label,
        "date": str(body.date),
        "hours": body.hours,
    }
    if body.task_id:
        row["task_id"] = body.task_id
    res = supabase.table("actual_hours").insert(row).execute()
    return res.data[0]


@router.put("/{entry_id}")
def update_actual(entry_id: str, body: ActualHoursUpdate):
    patch = {}
    if body.hours is not None:
        patch["hours"] = body.hours
    if body.task_label is not None:
        patch["task_label"] = body.task_label
    if body.date is not None:
        patch["date"] = str(body.date)
    res = supabase.table("actual_hours").update(patch).eq("id", entry_id).execute()
    return res.data[0]


@router.delete("/{entry_id}", status_code=204)
def delete_actual(entry_id: str):
    supabase.table("actual_hours").delete().eq("id", entry_id).execute()
    return Response(status_code=204)


@router.post("/copy-week")
def copy_week(body: CopyWeekRequest):
    """Populate actual_hours from the planned calendar for the given week."""
    monday = body.week_start
    monday_str = str(monday)

    # Check if data already exists for this week
    friday = monday + timedelta(days=4)
    existing = (
        supabase.table("actual_hours")
        .select("id", count="exact")
        .gte("date", monday_str)
        .lte("date", str(friday))
        .execute()
    )
    if (existing.count or 0) > 0 and not body.force:
        return {"created": 0, "skipped": True}

    # Determine week_number (1–4)
    wn = _week_number(monday)

    # Load all people
    people_res = supabase.table("people").select("id, name").eq("active", True).execute()
    all_people = people_res.data

    # Bulk-load schedules and distributions
    bulk_sched_raw = supabase.table("person_schedule").select(
        "person_id, day_of_week, hours, valid_from, valid_until"
    ).execute().data
    bulk_sched = active_schedule_rows(bulk_sched_raw, monday_str)

    bulk_dist_raw = supabase.table("task_distribution").select(
        "person_id, task_id, hours_per_week, preferred_days, valid_from, "
        "tasks(id, name, color, schedule_rule, is_fill, priority)"
    ).eq("week_number", wn).execute().data
    bulk_dist = active_distribution_rows(bulk_dist_raw, monday_str)

    # Build lookup maps
    from collections import defaultdict
    sched_by_pid = defaultdict(list)
    for r in bulk_sched:
        sched_by_pid[r["person_id"]].append(r)

    dist_by_pid = defaultdict(list)
    for r in bulk_dist:
        dist_by_pid[r["person_id"]].append(r)

    rows_to_insert = []
    week_days = _week_dates(monday)  # [Mon, Tue, Wed, Thu, Fri]

    for person in all_people:
        pid = person["id"]
        pname = person["name"]

        schedule = {r["day_of_week"]: r["hours"] for r in sched_by_pid[pid] if r["hours"] > 0}
        if not schedule:
            continue

        tasks_list = []
        preferred = {}
        for row in dist_by_pid[pid]:
            tasks_list.append({
                "task_id":        row["task_id"],
                "task_name":      row["tasks"]["name"],
                "hours_per_week": row["hours_per_week"],
                "schedule_rule":  row["tasks"].get("schedule_rule"),
                "is_fill":        row["tasks"].get("is_fill", False),
                "priority":       row["tasks"].get("priority"),
            })
            if row.get("preferred_days"):
                preferred[row["task_id"]] = row["preferred_days"]

        alloc, _ = distribute_week(tasks_list, schedule, pname, preferred)

        for dow_idx, day_date in enumerate(week_days):
            dow = dow_idx + 1  # 1=Mon … 5=Fri
            day_alloc = alloc.get(dow, {})
            for tid, hrs in day_alloc.items():
                if hrs <= 0:
                    continue
                task_meta = next((t for t in tasks_list if t["task_id"] == tid), None)
                rows_to_insert.append({
                    "person_id":  pid,
                    "task_id":    tid,
                    "task_label": task_meta["task_name"] if task_meta else "",
                    "date":       str(day_date),
                    "hours":      hrs,
                })

    if rows_to_insert:
        supabase.table("actual_hours").insert(rows_to_insert).execute()

    return {"created": len(rows_to_insert), "skipped": False}
