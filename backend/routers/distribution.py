from fastapi import APIRouter
from database import supabase
from typing import Optional
from datetime import date
from models import PreferredDayUpdate
from utils.versioned import active_distribution_rows

router = APIRouter(prefix="/distribution", tags=["distribution"])


@router.get("")
def get_distribution(week_number: Optional[int] = None, week_start: Optional[date] = None):
    q = supabase.table("task_distribution").select(
        "*, people(name), tasks(name, color, priority)"
    )
    if week_number is not None:
        q = q.eq("week_number", week_number)
    rows = q.execute().data
    # Always filter to the active version per (person, task) — default to today
    effective_date = week_start or date.today()
    rows = active_distribution_rows(rows, str(effective_date))
    return rows


@router.put("/preferred-day")
def set_preferred_day(body: PreferredDayUpdate):
    # Store as array; empty list or None clears the pin
    days = body.preferred_days if body.preferred_days else None
    supabase.table("task_people").update(
        {"preferred_days": days}
    ).eq("task_id", body.task_id).eq("person_id", body.person_id).eq("week_number", body.week_number).execute()
    return {"ok": True}
