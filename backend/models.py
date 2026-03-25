from pydantic import BaseModel
from typing import Optional, Literal
from datetime import date


class PersonCreate(BaseModel):
    name: str
    active: bool = True


class PersonUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None


class ScheduleEntry(BaseModel):
    person_id: str
    day_of_week: int   # 1=Mon … 5=Fri
    hours: float


class TaskCreate(BaseModel):
    name: str
    priority: Optional[int] = None
    color: Optional[str] = None
    weekly_hours_target: float = 0
    week_scope: str = "both"  # "both" | "W1" | "W234"
    is_fill: bool = False      # if True: absorbs each person's spare hours after all other tasks


class TaskUpdate(BaseModel):
    name: Optional[str] = None
    priority: Optional[int] = None
    color: Optional[str] = None
    weekly_hours_target: Optional[float] = None
    week_scope: Optional[str] = None
    is_fill: Optional[bool] = None


class TaskPersonAssign(BaseModel):
    task_id: str
    person_id: str


class TaskFixedHours(BaseModel):
    task_id: str
    person_id: str
    hours: float


class DistributeRequest(BaseModel):
    week_type: Literal["W1", "W234"]
    # Optional overrides: list of {person_id, task_id, hours} — used when
    # manager tweaks the preview before confirming
    overrides: Optional[list[dict]] = None


class AbsenceCreate(BaseModel):
    person_id: str
    date: date
    type: Literal["sick", "vacation"]
    reported_by: Optional[str] = None


class AbsenceRangeCreate(BaseModel):
    person_id: str
    start_date: date
    end_date: date
    type: Literal["sick", "vacation"]
    reported_by: Optional[str] = None


class ReallocationCreate(BaseModel):
    week_start_date: date
    covering_person_id: str
    task_id: str
    redirected_from_task_id: Optional[str] = None
    hours: float
    confirmed_by: str


class MakeupCreate(BaseModel):
    absent_person_id: str
    makeup_week_start_date: date
    task_id: str
    hours: float
    note: Optional[str] = None
