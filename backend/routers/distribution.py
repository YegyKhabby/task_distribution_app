from fastapi import APIRouter
from database import supabase
from typing import Optional

router = APIRouter(prefix="/distribution", tags=["distribution"])


@router.get("")
def get_distribution(week_type: Optional[str] = None):
    q = supabase.table("task_distribution").select(
        "*, people(name), tasks(name, color, priority)"
    )
    if week_type:
        q = q.eq("week_type", week_type)
    return q.execute().data
