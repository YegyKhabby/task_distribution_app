from fastapi import APIRouter
from database import supabase
from models import TaskPersonAssign, TaskFixedHours

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.get("")
def get_assignments(task_id: str = None, week_number: int = None):
    q = supabase.table("task_people").select("*, people(id, name), tasks(id, name)")
    if task_id:
        q = q.eq("task_id", task_id)
    if week_number is not None:
        q = q.eq("week_number", week_number)
    return q.execute().data


@router.post("", status_code=201)
def assign_person(body: TaskPersonAssign):
    res = supabase.table("task_people").upsert(
        body.model_dump(), on_conflict="task_id,person_id,week_number"
    ).execute()
    return res.data[0]


@router.delete("")
def unassign_person(task_id: str, person_id: str, week_number: int):
    supabase.table("task_people").delete().eq("task_id", task_id).eq("person_id", person_id).eq("week_number", week_number).execute()
    # Remove ALL version rows for this person/task/week (across all valid_from dates)
    supabase.table("task_distribution").delete().eq("task_id", task_id).eq("person_id", person_id).eq("week_number", week_number).execute()


# ── Fixed hours ──────────────────────────────────────────────────────────────

@router.get("/fixed")
def get_fixed_hours(task_id: str = None):
    q = supabase.table("task_fixed_hours").select("*, people(name), tasks(name)")
    if task_id:
        q = q.eq("task_id", task_id)
    return q.execute().data


@router.put("/fixed")
def set_fixed_hours(body: TaskFixedHours):
    if body.hours <= 0:
        # Remove fixed constraint if hours = 0
        supabase.table("task_fixed_hours").delete().eq("task_id", body.task_id).eq("person_id", body.person_id).execute()
        return {"removed": True}
    res = supabase.table("task_fixed_hours").upsert(
        body.model_dump(), on_conflict="task_id,person_id"
    ).execute()
    return res.data[0]
