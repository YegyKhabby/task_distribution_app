from fastapi import APIRouter
from database import supabase
from typing import Optional
from models import PreferredDayUpdate

router = APIRouter(prefix="/distribution", tags=["distribution"])


@router.get("")
def get_distribution(week_number: Optional[int] = None):
    q = supabase.table("task_distribution").select(
        "*, people(name), tasks(name, color, priority)"
    )
    if week_number is not None:
        q = q.eq("week_number", week_number)
    return q.execute().data


@router.put("/preferred-day")
def set_preferred_day(body: PreferredDayUpdate):
    # Store as array; empty list or None clears the pin
    days = body.preferred_days if body.preferred_days else None
    supabase.table("task_people").update(
        {"preferred_days": days}
    ).eq("task_id", body.task_id).eq("person_id", body.person_id).eq("week_number", body.week_number).execute()
    return {"ok": True}
