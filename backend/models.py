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
    location: str = "office"  # "office" | "home"


class TaskCreate(BaseModel):
    name: str
    priority: Optional[int] = None
    color: Optional[str] = None
    weekly_hours_target: float = 0
    week_scope: str = "both"  # "both" | "W1" | "W234"
    is_fill: bool = False      # if True: absorbs each person's spare hours after all other tasks
    responsible_person: Optional[str] = None
    schedule_rule: Optional[str] = None  # distribution rule: one_day, two_days, flexible_days, first_work_day, do_not_split, proportional, equal_per_day
    split_equally: bool = False           # if True: divide target hours equally among assigned people


class TaskUpdate(BaseModel):
    name: Optional[str] = None
    priority: Optional[int] = None
    color: Optional[str] = None
    weekly_hours_target: Optional[float] = None
    week_scope: Optional[str] = None
    is_fill: Optional[bool] = None
    responsible_person: Optional[str] = None
    schedule_rule: Optional[str] = None
    split_equally: Optional[bool] = None


class TaskPersonAssign(BaseModel):
    task_id: str
    person_id: str
    week_number: int  # 1–4


class TaskFixedHours(BaseModel):
    task_id: str
    person_id: str
    hours: float


class DistributeRequest(BaseModel):
    week_number: int  # 1–4 (used for preview; confirm runs all 4)
    effective_from: Optional[date] = None  # snapped to Monday; defaults to next Monday
    # Optional overrides: list of {person_id, task_id, hours}
    overrides: Optional[list[dict]] = None


class PreferredDayUpdate(BaseModel):
    task_id: str
    person_id: str
    week_number: int  # 1–4
    preferred_days: Optional[list[int]] = None  # list of 1–5, or None to clear


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
