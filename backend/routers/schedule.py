from fastapi import APIRouter
from database import supabase
from models import ScheduleEntry
from typing import Optional
from datetime import date
from pydantic import BaseModel

router = APIRouter(prefix="/schedule", tags=["schedule"])

DAYS = {1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri"}


class VersionedScheduleEntry(BaseModel):
    day_of_week: int
    hours: float
    location: str = "office"
    valid_from: date
    valid_until: Optional[date] = None


@router.get("")
def get_all_schedules():
    """Return all schedule versions for all people."""
    res = supabase.table("person_schedule").select("*").order("person_id").order("day_of_week").order("valid_from").execute()
    return res.data


@router.get("/{person_id}")
def get_schedule(person_id: str):
    """Return all schedule versions for a person (newest first per day)."""
    res = supabase.table("person_schedule").select("*").eq("person_id", person_id).order("day_of_week").order("valid_from", desc=True).execute()
    return res.data


@router.put("/{person_id}")
def save_schedule(person_id: str, entries: list[VersionedScheduleEntry]):
    """
    Add a new versioned schedule for a person.
    Each entry must include valid_from (and optionally valid_until).
    Old entries are preserved for historical calendar accuracy.
    """
    rows = [
        {
            "person_id": person_id,
            "day_of_week": e.day_of_week,
            "hours": e.hours,
            "location": e.location,
            "valid_from": str(e.valid_from),
            "valid_until": str(e.valid_until) if e.valid_until else None,
        }
        for e in entries
        if e.hours >= 0
    ]
    if rows:
        supabase.table("person_schedule").upsert(
            rows, on_conflict="person_id,day_of_week,valid_from"
        ).execute()
    return {"saved": len(rows)}


@router.delete("/{person_id}/version")
def delete_schedule_version(person_id: str, valid_from: date):
    """Delete a specific schedule version (by valid_from date). Cannot delete '2000-01-01' baseline."""
    if str(valid_from) == "2000-01-01":
        return {"error": "Cannot delete the baseline schedule version"}
    supabase.table("person_schedule").delete().eq("person_id", person_id).eq("valid_from", str(valid_from)).execute()
    return {"deleted": True}
