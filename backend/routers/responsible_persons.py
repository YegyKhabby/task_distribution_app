from fastapi import APIRouter, HTTPException
from database import supabase
from pydantic import BaseModel

router = APIRouter(prefix="/responsible-persons", tags=["responsible-persons"])


class ResponsiblePersonCreate(BaseModel):
    name: str


@router.get("")
def list_responsible_persons():
    res = supabase.table("responsible_persons").select("*").order("name").execute()
    return res.data


@router.post("", status_code=201)
def create_responsible_person(body: ResponsiblePersonCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Name required")
    res = supabase.table("responsible_persons").insert({"name": name}).execute()
    return res.data[0]


@router.delete("/{person_id}", status_code=204)
def delete_responsible_person(person_id: str):
    supabase.table("responsible_persons").delete().eq("id", person_id).execute()
