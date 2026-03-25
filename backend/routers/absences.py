from fastapi import APIRouter, HTTPException
from database import supabase
from models import AbsenceCreate, AbsenceRangeCreate
from datetime import timedelta

router = APIRouter(prefix="/absences", tags=["absences"])


@router.get("")
def list_absences(person_id: str = None):
    q = supabase.table("absences").select("*, people(name)").order("date")
    if person_id:
        q = q.eq("person_id", person_id)
    res = q.execute()
    return res.data


@router.post("", status_code=201)
def create_absence(body: AbsenceCreate):
    data = body.model_dump()
    data["date"] = str(data["date"])
    res = supabase.table("absences").insert(data).execute()
    return res.data[0]


@router.post("/range", status_code=201)
def create_absence_range(body: AbsenceRangeCreate):
    """Insert one row per calendar day in the range (skip weekends)."""
    rows = []
    d = body.start_date
    while d <= body.end_date:
        if d.weekday() < 5:  # Mon-Fri only
            rows.append({
                "person_id": body.person_id,
                "date": str(d),
                "type": body.type,
                "reported_by": body.reported_by,
            })
        d += timedelta(days=1)
    if not rows:
        return []
    res = supabase.table("absences").insert(rows).execute()
    return res.data


@router.delete("/{absence_id}", status_code=204)
def delete_absence(absence_id: str):
    supabase.table("absences").delete().eq("id", absence_id).execute()
