from fastapi import APIRouter, HTTPException
from database import supabase
from models import TaskCreate, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("")
def list_tasks():
    res = supabase.table("tasks").select("*").order("priority").execute()
    return res.data


@router.post("", status_code=201)
def create_task(body: TaskCreate):
    res = supabase.table("tasks").insert(body.model_dump()).execute()
    return res.data[0]


@router.put("/{task_id}")
def update_task(task_id: str, body: TaskUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None or k in ('responsible_person', 'schedule_rule', 'split_equally')}
    if not updates:
        raise HTTPException(400, "No fields to update")
    res = supabase.table("tasks").update(updates).eq("id", task_id).execute()
    if not res.data:
        raise HTTPException(404, "Task not found")
    return res.data[0]


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: str):
    supabase.table("tasks").delete().eq("id", task_id).execute()
