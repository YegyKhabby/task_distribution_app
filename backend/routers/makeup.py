from fastapi import APIRouter
from database import supabase
from models import MakeupCreate

router = APIRouter(prefix="/makeup", tags=["makeup"])


@router.get("")
def list_makeup(person_id: str = None):
    q = supabase.table("makeup_hours").select(
        "*, person:absent_person_id(name), task:task_id(name)"
    ).order("makeup_week_start_date")
    if person_id:
        q = q.eq("absent_person_id", person_id)
    res = q.execute()
    return res.data


@router.post("", status_code=201)
def create_makeup(body: MakeupCreate):
    data = body.model_dump()
    data["makeup_week_start_date"] = str(data["makeup_week_start_date"])
    res = supabase.table("makeup_hours").insert(data).execute()
    return res.data[0]


@router.delete("/{makeup_id}", status_code=204)
def delete_makeup(makeup_id: str):
    supabase.table("makeup_hours").delete().eq("id", makeup_id).execute()
