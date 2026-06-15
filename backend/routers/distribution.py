from fastapi import APIRouter
from database import supabase
from typing import Optional
from datetime import date
from models import PreferredDayUpdate
from utils.versioned import active_distribution_rows
from utils.supabase_retry import supabase_query

router = APIRouter(prefix="/distribution", tags=["distribution"])


def _fetch_distribution_rows(week_number: Optional[int] = None) -> list[dict]:
    rows = []
    start = 0
    page_size = 1000

    while True:
        q = supabase.table("task_distribution").select(
            "*, people(name), tasks(name, color, priority)"
        ).range(start, start + page_size - 1)
        if week_number is not None:
            q = q.eq("week_number", week_number)
        batch = supabase_query(lambda: q.execute().data)
        rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size

    return rows


@router.get("")
def get_distribution(week_number: Optional[int] = None, week_start: Optional[date] = None):
    rows = _fetch_distribution_rows(week_number)
    effective_date = str(week_start or date.today())

    if week_number is not None:
        # Single week: apply versioning once
        return active_distribution_rows(rows, effective_date)
    else:
        # All weeks: apply versioning independently per week_number so a newer
        # confirm on week 2 doesn't wipe out week 1's active rows
        result = []
        weeks = {r.get("week_number") for r in rows}
        for wn in weeks:
            week_rows = [r for r in rows if r.get("week_number") == wn]
            result.extend(active_distribution_rows(week_rows, effective_date))
        return result


@router.put("/preferred-day")
def set_preferred_day(body: PreferredDayUpdate):
    # Store as array; empty list or None clears the pin
    days = body.preferred_days if body.preferred_days else None
    supabase.table("task_people").update(
        {"preferred_days": days}
    ).eq("task_id", body.task_id).eq("person_id", body.person_id).eq("week_number", body.week_number).execute()
    return {"ok": True}
