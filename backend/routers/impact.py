from fastapi import APIRouter
from database import supabase
from datetime import date, timedelta
from collections import defaultdict


def round_half(x: float) -> float:
    return round(x * 2) / 2

router = APIRouter(prefix="/impact", tags=["impact"])


def week_dates(week_start: date):
    """Return Mon-Fri dates for a given week_start (must be Monday)."""
    return [week_start + timedelta(days=i) for i in range(5)]


def determine_week_number(week_start_date: date, week_start_offset: int = 1) -> int:
    """
    Return 1–4: the working-week position within the month using the 4-week
    wrap cycle. week_start_offset shifts which rotation week the first Monday
    of the month maps to (default 1).
    """
    first_day = week_start_date.replace(day=1)
    first_monday = first_day + timedelta(days=(7 - first_day.weekday()) % 7)
    index = (week_start_date - first_monday).days // 7
    return ((index + week_start_offset - 1) % 4) + 1


def get_monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def compute_week_impact(week_start: date, person_ids: set = None) -> dict:
    """
    Compute unallocated hours and coverage options for a given week.
    If person_ids is provided, only compute for those people.
    """
    week_end = week_start + timedelta(days=4)
    week_number = determine_week_number(week_start)

    # 1. Find absences for that week
    absences_res = supabase.table("absences").select(
        "*, people(id, name, weekly_hours)"
    ).gte("date", str(week_start)).lte("date", str(week_end)).execute()

    absences = absences_res.data

    # Group absence days by person
    absent_people: dict[str, dict] = {}
    for a in absences:
        pid = a["person_id"]
        if person_ids and pid not in person_ids:
            continue
        if pid not in absent_people:
            absent_people[pid] = {
                "person": a["people"],
                "absent_days": 0,
                "absent_dates": [],
            }
        absent_people[pid]["absent_days"] += 1
        absent_people[pid]["absent_dates"].append(a["date"])

    if not absent_people:
        return {
            "week_start": str(week_start),
            "week_number": week_number,
            "absent_people": [],
            "confirmed_reallocations": [],
        }

    # Fetch schedules for absent people — same source as the Calendar page
    for pid, info in absent_people.items():
        sched_res = supabase.table("person_schedule").select("day_of_week, hours").eq("person_id", pid).execute()
        sched = {row["day_of_week"]: row["hours"] for row in sched_res.data}
        info["schedule"] = sched
        info["weekly_total"] = sum(sched.values()) or 1

    # 2. Get task distributions for all people for this week number
    dist_res = supabase.table("task_distribution").select(
        "*, people(id, name, weekly_hours), tasks(id, name, color, priority)"
    ).eq("week_number", week_number).execute()
    dist_all = dist_res.data

    # Index: person_id -> list of {task_id, task_name, hours_per_week}
    person_tasks: dict[str, list] = defaultdict(list)
    # Index: task_id -> list of {person_id, name, hours_per_week}
    task_people: dict[str, list] = defaultdict(list)

    for d in dist_all:
        pid = d["person_id"]
        tid = d["task_id"]
        person_tasks[pid].append({
            "task_id": tid,
            "task_name": d["tasks"]["name"],
            "task_color": d["tasks"].get("color"),
            "hours_per_week": d["hours_per_week"],
        })
        task_people[tid].append({
            "person_id": pid,
            "name": d["people"]["name"],
            "weekly_hours": d["people"]["weekly_hours"],
            "hours_on_task": d["hours_per_week"],
        })

    # Compute spare hours per person: weekly_hours - sum(all task hours)
    spare_hours: dict[str, float] = {}
    for pid, tasks_list in person_tasks.items():
        dist_entry = next((d for d in dist_all if d["person_id"] == pid), None)
        if dist_entry:
            weekly = dist_entry["people"]["weekly_hours"]
            total_task_hrs = sum(t["hours_per_week"] for t in tasks_list)
            spare_hours[pid] = max(0.0, weekly - total_task_hrs)

    # 3. Get confirmed reallocations for this week (reduces unallocated)
    reallocations_res = supabase.table("temporary_reallocations").select(
        "*, task:task_id(id, name)"
    ).eq("week_start_date", str(week_start)).execute()
    reallocations = reallocations_res.data

    # Index reallocations: task_id -> total hours already covered
    task_covered: dict[str, float] = defaultdict(float)
    for r in reallocations:
        task_covered[r["task_id"]] += r["hours"]

    # 4. Get makeup hours already planned for this week (reduces unallocated)
    makeup_res = supabase.table("makeup_hours").select("*").eq(
        "makeup_week_start_date", str(week_start)
    ).execute()
    makeup_rows = makeup_res.data

    # Index makeup: absent_person_id -> task_id -> makeup hours
    makeup_index: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for m in makeup_rows:
        makeup_index[m["absent_person_id"]][m["task_id"]] += m["hours"]

    # 5. Build impact report per absent person
    result = []
    for pid, info in absent_people.items():
        person = info["person"]
        absent_days = info["absent_days"]
        sched = info["schedule"]
        weekly_total = info["weekly_total"]

        tasks_for_person = person_tasks.get(pid, [])
        unallocated_tasks = []

        for t in tasks_for_person:
            tid = t["task_id"]
            # Sum the exact hours the Calendar would show for each absent day
            raw_unallocated = sum(
                round_half(t["hours_per_week"] * sched.get(date.fromisoformat(d).weekday() + 1, 0.0) / weekly_total)
                for d in info["absent_dates"]
            )
            makeup_hrs = makeup_index[pid].get(tid, 0.0)
            covered = task_covered.get(tid, 0.0)
            remaining = max(0.0, raw_unallocated - makeup_hrs - covered)

            # Find coverage candidates: other people who do this task
            candidates = []
            for cp in task_people.get(tid, []):
                if cp["person_id"] == pid:
                    continue
                cp_spare = spare_hours.get(cp["person_id"], 0.0)
                cp_tasks = person_tasks.get(cp["person_id"], [])
                reducible_tasks = [
                    {
                        "task_id": ct["task_id"],
                        "task_name": ct["task_name"],
                        "hours_per_week": ct["hours_per_week"],
                    }
                    for ct in cp_tasks
                    if ct["task_id"] != tid
                ]
                candidates.append({
                    "person_id": cp["person_id"],
                    "name": cp["name"],
                    "hours_on_task": cp["hours_on_task"],
                    "spare_hours": cp_spare,
                    "reducible_tasks": reducible_tasks,
                })

            unallocated_tasks.append({
                "task_id": tid,
                "task_name": t["task_name"],
                "task_color": t.get("task_color"),
                "raw_unallocated_hours": round(raw_unallocated, 2),
                "makeup_hours": round(makeup_hrs, 2),
                "covered_hours": round(covered, 2),
                "remaining_unallocated": round(remaining, 2),
                "coverage_candidates": candidates,
            })

        result.append({
            "person_id": pid,
            "person_name": person["name"],
            "weekly_hours": person["weekly_hours"],
            "absent_days": absent_days,
            "absent_dates": info["absent_dates"],
            "unallocated_tasks": unallocated_tasks,
        })

    return {
        "week_start": str(week_start),
        "week_number": week_number,
        "absent_people": result,
        "confirmed_reallocations": reallocations,
    }


@router.get("/upcoming")
def get_impact_upcoming(from_date: str):
    """
    Return all upcoming absent people (from from_date forward) aggregated by person,
    with each person's weeks, unallocated tasks, and confirmed reallocations.
    """
    from_date_obj = date.fromisoformat(from_date)

    # 1. Fetch all absences >= from_date
    absences_res = supabase.table("absences").select(
        "person_id, date, people(id, name)"
    ).gte("date", from_date).execute()
    absences = absences_res.data

    if not absences:
        return {"persons": []}

    # 2. Collect week_starts per person
    week_persons: dict[date, set] = defaultdict(set)
    person_names: dict[str, str] = {}

    for a in absences:
        pid = a["person_id"]
        d = date.fromisoformat(a["date"])
        ws = get_monday(d)
        week_persons[ws].add(pid)
        person_names[pid] = a["people"]["name"]

    # 3. For each week compute impact; aggregate by person
    persons_data: dict[str, dict] = {}

    for week_start in sorted(week_persons.keys()):
        pids = week_persons[week_start]
        week_result = compute_week_impact(week_start, person_ids=pids)
        reallocations = week_result["confirmed_reallocations"]

        for ap in week_result["absent_people"]:
            pid = ap["person_id"]
            if pid not in persons_data:
                persons_data[pid] = {
                    "person_id": pid,
                    "person_name": ap["person_name"],
                    "total_absent_days": 0,
                    "weeks": [],
                }

            # Attach only reallocations relevant to this person's tasks
            person_task_ids = {t["task_id"] for t in ap["unallocated_tasks"]}
            week_reallocations = [r for r in reallocations if r["task_id"] in person_task_ids]

            persons_data[pid]["total_absent_days"] += ap["absent_days"]
            persons_data[pid]["weeks"].append({
                "week_start": week_result["week_start"],
                "week_number": week_result["week_number"],
                "absent_dates": ap["absent_dates"],
                "absent_days": ap["absent_days"],
                "unallocated_tasks": ap["unallocated_tasks"],
                "confirmed_reallocations": week_reallocations,
            })

    return {"persons": list(persons_data.values())}


@router.get("/{week_start_str}")
def get_impact(week_start_str: str):
    """
    Compute unallocated hours and coverage options for a given week.
    week_start_str: ISO date string for the Monday of the week (YYYY-MM-DD)
    """
    week_start = date.fromisoformat(week_start_str)
    return compute_week_impact(week_start)
