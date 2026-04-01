from fastapi import APIRouter, HTTPException
from database import supabase
from models import DistributeRequest
from collections import defaultdict

router = APIRouter(prefix="/distribute", tags=["distribute"])


def round_half(val: float) -> float:
    return round(val * 2) / 2


def fetch_all(week_number: int):
    people = supabase.table("people").select("*, person_schedule(day_of_week, hours)").eq("active", True).execute().data
    tasks = supabase.table("tasks").select("*").execute().data
    assignments = supabase.table("task_people").select("task_id, person_id").eq("week_number", week_number).execute().data
    fixed = supabase.table("task_fixed_hours").select("task_id, person_id, hours").execute().data
    return people, tasks, assignments, fixed


def compute_weekly_hours(person):
    return sum(s["hours"] for s in (person.get("person_schedule") or []))


def iterative_solve(task_needs, task_auto_pids, person_caps):
    """
    Iteratively distribute hours until all tasks are covered or no more progress is possible.

    task_needs:     {task_id: hours_needed}
    task_auto_pids: {task_id: [person_id, ...]}  — only auto (non-fixed) people
    person_caps:    {person_id: available_hours}

    Returns:
        result        {(person_id, task_id): hours}
        remaining_cap {person_id: leftover hours}
        shortfalls    {task_id: hours still unmet}
    """
    remaining_need = {tid: round_half(n) for tid, n in task_needs.items() if n > 0.1}
    remaining_cap = {pid: round_half(c) for pid, c in person_caps.items()}
    result = {}

    MAX_ITER = 50
    for _ in range(MAX_ITER):
        if not remaining_need:
            break

        total_need_before = sum(remaining_need.values())

        # Each iteration: process tasks ordered by difficulty
        # (fewest available assignees first — hardest to fill gets priority)
        def difficulty(tid):
            return sum(1 for p in task_auto_pids.get(tid, []) if remaining_cap.get(p, 0) >= 0.5)

        for tid in sorted(remaining_need.keys(), key=difficulty):
            need = remaining_need.get(tid, 0)
            if need < 0.25:
                continue

            available = [(p, remaining_cap[p])
                         for p in task_auto_pids.get(tid, [])
                         if remaining_cap.get(p, 0) >= 0.5]

            if not available:
                continue

            total_cap = sum(c for _, c in available)
            to_dist = round_half(min(need, total_cap))

            if to_dist < 0.5:
                continue

            # Proportional distribution
            dist = {}
            for pid, cap in available:
                dist[pid] = round_half((cap / total_cap) * to_dist)

            # Fix rounding gap while respecting capacity
            gap = round_half(to_dist - sum(dist.values()))
            iters = 0
            while abs(gap) >= 0.5 and iters < 20:
                iters += 1
                if gap > 0:
                    eligible = {p: remaining_cap[p] - dist[p] for p in dist if remaining_cap[p] - dist[p] >= 0.5}
                    if not eligible:
                        break
                    pid = max(eligible, key=eligible.get)
                    dist[pid] += 0.5
                    gap -= 0.5
                else:
                    eligible = {p: dist[p] for p in dist if dist[p] >= 0.5}
                    if not eligible:
                        break
                    pid = max(eligible, key=eligible.get)
                    dist[pid] -= 0.5
                    gap += 0.5

            # Apply
            for pid, hrs in dist.items():
                if hrs > 0:
                    result[(pid, tid)] = round_half(result.get((pid, tid), 0) + hrs)
                    remaining_cap[pid] = round_half(remaining_cap[pid] - hrs)
                    remaining_need[tid] = round_half(max(0, remaining_need.get(tid, 0) - hrs))

            if remaining_need.get(tid, 0) < 0.25:
                del remaining_need[tid]

        # Stop if no progress was made this iteration
        total_need_after = sum(remaining_need.values())
        if total_need_after >= total_need_before - 0.1:
            break

    return result, remaining_cap, remaining_need


def compute_preview(week_number: int):
    people, tasks, assignments, fixed_rows = fetch_all(week_number)

    # Map week_number to legacy week_scope filter value
    week_scope_filter = "W1" if week_number == 1 else "W234"

    person_map = {p["id"]: p for p in people}

    task_assigned: dict[str, set] = defaultdict(set)
    for a in assignments:
        task_assigned[a["task_id"]].add(a["person_id"])

    fixed_map: dict[tuple, float] = {}
    for f in fixed_rows:
        fixed_map[(f["task_id"], f["person_id"])] = f["hours"]

    # Total weekly capacity per person
    capacity = {p["id"]: compute_weekly_hours(p) for p in people}

    # Separate normal tasks from fill tasks, respect week_scope
    normal_tasks = []
    fill_tasks = []
    for t in tasks:
        scope = t.get("week_scope", "both")
        if scope != "both" and scope != week_scope_filter:
            continue
        if t.get("is_fill"):
            fill_tasks.append(t)
        else:
            normal_tasks.append(t)

    # --- Step 1: apply fixed hours ---
    fixed_allocated = defaultdict(float)  # person_id -> hours from fixed
    task_fixed_totals = defaultdict(float)  # task_id -> hours from fixed

    for (tid, pid), hrs in fixed_map.items():
        # Only count fixed for tasks in scope AND person assigned this week
        task = next((t for t in normal_tasks if t["id"] == tid), None)
        if task is None:
            continue
        if pid not in task_assigned.get(tid, set()):
            continue
        fixed_allocated[pid] += hrs
        task_fixed_totals[tid] += hrs

    # --- Step 2: build inputs for iterative solver ---
    task_needs = {}
    task_auto_pids = {}

    for task in normal_tasks:
        tid = task["id"]
        target = task["weekly_hours_target"]
        assigned = task_assigned.get(tid, set())
        auto_pids = [p for p in assigned if (tid, p) not in fixed_map]
        remaining = round_half(max(0, target - task_fixed_totals[tid]))
        task_needs[tid] = remaining
        task_auto_pids[tid] = auto_pids

    # Available capacity for auto distribution = total - fixed
    person_auto_caps = {
        pid: round_half(max(0, capacity[pid] - fixed_allocated[pid]))
        for pid in capacity
    }

    # --- Step 3: solve iteratively ---
    auto_result, remaining_cap, shortfalls = iterative_solve(task_needs, task_auto_pids, person_auto_caps)

    # --- Step 4: build result list ---
    # person_id -> total allocated (fixed + auto)
    total_allocated = defaultdict(float)
    for pid, hrs in fixed_allocated.items():
        total_allocated[pid] += hrs
    for (pid, tid), hrs in auto_result.items():
        total_allocated[pid] += hrs

    warnings = []
    result_tasks = []

    for task in sorted(normal_tasks, key=lambda t: t.get("priority") or 999):
        tid = task["id"]
        assigned = task_assigned.get(tid, set())

        distributions = []
        for pid in assigned:
            if (tid, pid) in fixed_map:
                hrs = fixed_map[(tid, pid)]
                p = person_map[pid]
                distributions.append({"person_id": pid, "person_name": p["name"], "hours": hrs, "type": "fixed"})
            else:
                hrs = auto_result.get((pid, tid), 0)
                if hrs > 0:
                    p = person_map[pid]
                    distributions.append({"person_id": pid, "person_name": p["name"], "hours": hrs, "type": "auto"})

        total_dist = round_half(sum(d["hours"] for d in distributions))
        target = task["weekly_hours_target"]
        gap = round_half(abs(total_dist - target))

        task_warning = None
        if gap >= 0.5:
            task_warning = f"{gap}h short — not enough capacity. Assign more people or reduce target."
            warnings.append(f"{task['name']}: {gap}h short")

        result_tasks.append({
            "task_id": tid,
            "task_name": task["name"],
            "task_color": task.get("color"),
            "target_hours": target,
            "is_fill": False,
            "distributions": distributions,
            "total_distributed": total_dist,
            "warning": task_warning,
        })

    # --- Step 5: fill tasks absorb leftover per person ---
    # Recompute remaining cap after auto distribution
    final_remaining = {
        pid: round_half(max(0, capacity[pid] - total_allocated[pid]))
        for pid in capacity
    }

    for task in fill_tasks:
        tid = task["id"]
        assigned = task_assigned.get(tid, set())
        distributions = []
        for pid in assigned:
            spare = final_remaining.get(pid, 0)
            if spare >= 0.5:
                p = person_map[pid]
                distributions.append({"person_id": pid, "person_name": p["name"], "hours": spare, "type": "fill"})
                total_allocated[pid] += spare
                final_remaining[pid] = 0

        result_tasks.append({
            "task_id": tid,
            "task_name": task["name"],
            "task_color": task.get("color"),
            "target_hours": None,
            "is_fill": True,
            "distributions": distributions,
            "total_distributed": round_half(sum(d["hours"] for d in distributions)),
            "warning": None,
        })

    # --- Step 6: person summary ---
    person_summary = []
    for p in people:
        pid = p["id"]
        alloc = round_half(total_allocated.get(pid, 0))
        weekly = capacity.get(pid, 0)
        person_summary.append({
            "person_id": pid,
            "name": p["name"],
            "weekly_hours": weekly,
            "allocated_hours": alloc,
            "spare_hours": round_half(max(0, weekly - alloc)),
            "over_allocated": alloc > weekly + 0.1,
        })

    return {
        "week_number": week_number,
        "tasks": result_tasks,
        "person_summary": person_summary,
        "warnings": warnings,
    }


@router.get("/preview")
def preview_distribution(week_number: int = 1):
    return compute_preview(week_number)


@router.post("/confirm")
def confirm_distribution(body: DistributeRequest):
    preview = compute_preview(body.week_number)

    override_map = {}
    if body.overrides:
        for o in body.overrides:
            override_map[(o["person_id"], o["task_id"])] = o["hours"]

    # Read preferred_days from task_people (source of truth)
    assignments_res = supabase.table("task_people").select(
        "person_id, task_id, preferred_day"
    ).eq("week_number", body.week_number).execute()
    preferred_map = {
        (r["person_id"], r["task_id"]): r["preferred_day"]
        for r in assignments_res.data
        if r.get("preferred_day") is not None
    }

    rows = []
    for task in preview["tasks"]:
        tid = task["task_id"]
        for d in task["distributions"]:
            pid = d["person_id"]
            hrs = override_map.get((pid, tid), d["hours"])
            if hrs > 0:
                row = {
                    "person_id": pid,
                    "task_id": tid,
                    "week_number": body.week_number,
                    "hours_per_week": hrs,
                }
                pd = preferred_map.get((pid, tid))
                if pd is not None:
                    row["preferred_day"] = pd
                rows.append(row)

    if not rows:
        raise HTTPException(400, "Nothing to save — assign people to tasks first")

    # Delete all existing rows for this week first so removed assignments don't linger
    supabase.table("task_distribution").delete().eq("week_number", body.week_number).execute()
    supabase.table("task_distribution").insert(rows).execute()

    return {"saved": len(rows), "week_number": body.week_number}
