from fastapi import APIRouter, HTTPException
from database import supabase
from models import PersonCreate, PersonUpdate

router = APIRouter(prefix="/people", tags=["people"])


@router.get("")
def list_people():
    res = supabase.table("people").select("*, person_schedule(day_of_week, hours)").order("name").execute()
    # Attach computed weekly_hours to each person
    for p in res.data:
        p["weekly_hours"] = sum(s["hours"] for s in (p.get("person_schedule") or []))
    return res.data


@router.post("", status_code=201)
def create_person(body: PersonCreate):
    res = supabase.table("people").insert(body.model_dump()).execute()
    return res.data[0]


@router.put("/{person_id}")
def update_person(person_id: str, body: PersonUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    res = supabase.table("people").update(updates).eq("id", person_id).execute()
    if not res.data:
        raise HTTPException(404, "Person not found")
    return res.data[0]


@router.delete("/{person_id}", status_code=204)
def delete_person(person_id: str):
    supabase.table("people").delete().eq("id", person_id).execute()
