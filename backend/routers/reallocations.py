from fastapi import APIRouter, HTTPException
from database import supabase
from models import ReallocationCreate

router = APIRouter(prefix="/reallocations", tags=["reallocations"])


@router.get("")
def list_reallocations(week_start_date: str = None):
    q = supabase.table("temporary_reallocations").select(
        "*, covering_person:covering_person_id(name), task:task_id(name), redirected_from:redirected_from_task_id(name)"
    ).order("week_start_date")
    if week_start_date:
        q = q.eq("week_start_date", week_start_date)
    res = q.execute()
    return res.data


@router.post("", status_code=201)
def create_reallocation(body: ReallocationCreate):
    data = body.model_dump()
    data["week_start_date"] = str(data["week_start_date"])
    res = supabase.table("temporary_reallocations").insert(data).execute()
    return res.data[0]


@router.delete("/{reallocation_id}", status_code=204)
def delete_reallocation(reallocation_id: str):
    supabase.table("temporary_reallocations").delete().eq("id", reallocation_id).execute()
