from fastapi import APIRouter
from database import supabase
from models import ScheduleEntry

router = APIRouter(prefix="/schedule", tags=["schedule"])

DAYS = {1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri"}


@router.get("")
def get_all_schedules():
    """Return all schedules for all people in one query."""
    res = supabase.table("person_schedule").select("*").order("person_id").order("day_of_week").execute()
    return res.data


@router.get("/{person_id}")
def get_schedule(person_id: str):
    res = supabase.table("person_schedule").select("*").eq("person_id", person_id).order("day_of_week").execute()
    return res.data


@router.put("/{person_id}")
def save_schedule(person_id: str, entries: list[ScheduleEntry]):
    """Replace the full schedule for a person. Send all 5 days (hours=0 for days off)."""
    # Delete existing then re-insert
    supabase.table("person_schedule").delete().eq("person_id", person_id).execute()
    rows = [
        {"person_id": person_id, "day_of_week": e.day_of_week, "hours": e.hours, "location": e.location}
        for e in entries
        if e.hours > 0
    ]
    if rows:
        supabase.table("person_schedule").insert(rows).execute()
    return {"saved": len(rows)}
