import os
import re
from collections import defaultdict
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from database import supabase
from utils.versioned import active_schedule_rows

router = APIRouter(prefix="/attendance", tags=["attendance"])


class DeskbirdAttendanceDay(BaseModel):
    date: date
    people: list[str] = Field(default_factory=list)


class DeskbirdAttendanceSyncRequest(BaseModel):
    source: str = "local-laptop"
    days: list[DeskbirdAttendanceDay]


def normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower()).strip()


def normalize_first_name(value: str) -> str:
    first = (value or "").strip().split()[0] if (value or "").strip() else ""
    return normalize_name(first)


def workdays_from(start_date: date, days: int) -> list[date]:
    current = start_date
    output: list[date] = []
    while len(output) < days:
        if current.weekday() < 5:
            output.append(current)
        current += timedelta(days=1)
    return output


def group_people_by_first_name(people_rows):
    grouped = defaultdict(list)
    for row in people_rows:
        grouped[normalize_first_name(row["name"])].append(row["name"])
    return grouped


def require_sync_token(provided: Optional[str]) -> None:
    configured = os.getenv("DESKBIRD_SYNC_TOKEN", "").strip()
    if configured and provided != configured:
        raise HTTPException(status_code=401, detail="Invalid sync token")


def fetch_latest_run():
    res = (
        supabase.table("deskbird_sync_runs")
        .select("*")
        .order("fetched_at", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


@router.post("/deskbird-sync")
def sync_deskbird_attendance(
    body: DeskbirdAttendanceSyncRequest,
    x_sync_token: Optional[str] = Header(default=None),
):
    require_sync_token(x_sync_token)
    if not body.days:
        raise HTTPException(status_code=400, detail="At least one day is required")

    ordered_days = sorted(body.days, key=lambda item: item.date)
    sync_run = (
        supabase.table("deskbird_sync_runs")
        .insert(
            {
                "source": body.source,
                "start_date": str(ordered_days[0].date),
                "end_date": str(ordered_days[-1].date),
            }
        )
        .execute()
        .data[0]
    )

    rows = []
    for day in ordered_days:
        seen = set()
        for person in day.people:
            person_name = (person or "").strip()
            normalized = normalize_name(person_name)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            rows.append(
                {
                    "sync_run_id": sync_run["id"],
                    "booking_date": str(day.date),
                    "person_name": person_name,
                    "normalized_name": normalized,
                    "normalized_first_name": normalize_first_name(person_name),
                }
            )

    if rows:
        supabase.table("deskbird_attendance_bookings").insert(rows).execute()

    return {"sync_run_id": sync_run["id"], "days": len(ordered_days), "bookings": len(rows)}


@router.get("/deskbird")
def get_deskbird_attendance(
    start_date: Optional[str] = Query(default=None),
    days: int = Query(default=7, ge=1, le=10),
):
    date_start = date.fromisoformat(start_date or str(date.today()))
    target_days = workdays_from(date_start, days)
    target_day_strings = [str(d) for d in target_days]

    latest_run = fetch_latest_run()
    bookings = []
    if latest_run:
        bookings = (
            supabase.table("deskbird_attendance_bookings")
            .select("booking_date, person_name, normalized_name, normalized_first_name")
            .eq("sync_run_id", latest_run["id"])
            .in_("booking_date", target_day_strings)
            .execute()
            .data
        )

    people_rows = (
        supabase.table("people").select("id, name").eq("active", True).order("name").execute().data
    )
    schedule_rows = (
        supabase.table("person_schedule")
        .select("person_id, day_of_week, hours, location, valid_from, valid_until")
        .execute()
        .data
    )
    absence_rows = (
        supabase.table("absences")
        .select("person_id, date")
        .gte("date", target_day_strings[0])
        .lte("date", target_day_strings[-1])
        .execute()
        .data
    )

    people_by_id = {row["id"]: row["name"] for row in people_rows}
    duplicate_first_name_groups = {
        first_name: sorted(names)
        for first_name, names in group_people_by_first_name(people_rows).items()
        if first_name and len(names) > 1
    }
    absent_by_date = defaultdict(set)
    for row in absence_rows:
        absent_by_date[row["date"]].add(row["person_id"])

    actual_by_date = defaultdict(list)
    actual_match_keys_by_date = defaultdict(set)
    for row in bookings:
        actual_by_date[row["booking_date"]].append(row["person_name"])
        actual_match_keys_by_date[row["booking_date"]].add(
            row.get("normalized_first_name") or normalize_first_name(row["person_name"])
        )
        actual_match_keys_by_date[row["booking_date"]].add(
            row.get("normalized_name") or normalize_name(row["person_name"])
        )

    schedule_rows_by_person = defaultdict(list)
    for row in schedule_rows:
        schedule_rows_by_person[row["person_id"]].append(row)

    results = []
    for current_day in target_days:
        day_str = str(current_day)
        dow = current_day.weekday() + 1
        expected = []
        missing = []
        expected_first = set()
        active_for_day = []
        for person_rows in schedule_rows_by_person.values():
            active_for_day.extend(active_schedule_rows(person_rows, day_str))
        by_person = defaultdict(dict)
        for row in active_for_day:
            by_person[row["person_id"]][row["day_of_week"]] = {
                "hours": float(row.get("hours") or 0),
                "location": (row.get("location") or "office").lower(),
            }
        for person_id, person_name in people_by_id.items():
            sched = by_person.get(person_id, {}).get(dow)
            if not sched or sched["hours"] <= 0 or sched["location"] != "office":
                continue
            if person_id in absent_by_date[day_str]:
                continue
            first_name_key = normalize_first_name(person_name)
            use_full_name = first_name_key in duplicate_first_name_groups
            normalized = normalize_name(person_name) if use_full_name else first_name_key
            expected.append(person_name)
            expected_first.add(normalized)
            if normalized not in actual_match_keys_by_date[day_str]:
                missing.append(person_name)

        actual = sorted(actual_by_date[day_str])
        results.append(
            {
                "date": day_str,
                "weekday": current_day.strftime("%a"),
                "expected_office": sorted(expected),
                "actual_deskbird": actual,
                "missing_bookings": sorted(missing),
                "unexpected_bookings": sorted(
                    person
                    for person in actual
                    if (normalize_name(person) if normalize_first_name(person) in duplicate_first_name_groups else normalize_first_name(person)) not in expected_first
                ),
                "absent_people": sorted(
                    people_by_id[person_id]
                    for person_id in absent_by_date[day_str]
                    if person_id in people_by_id
                ),
            }
        )

    return {
        "start_date": target_day_strings[0],
        "end_date": target_day_strings[-1],
        "days": results,
        "warnings": {
            "duplicate_first_names": duplicate_first_name_groups,
            "missing_sync": not bool(latest_run),
            "incomplete_sync_range": bool(latest_run) and (
                latest_run["start_date"] > target_day_strings[0] or latest_run["end_date"] < target_day_strings[-1]
            ),
            "stale_sync": bool(latest_run) and latest_run["end_date"] < target_day_strings[-1],
        },
        "sync": {
            "available": bool(latest_run),
            "source": latest_run["source"] if latest_run else None,
            "fetched_at": latest_run["fetched_at"] if latest_run else None,
            "start_date": latest_run["start_date"] if latest_run else None,
            "end_date": latest_run["end_date"] if latest_run else None,
        },
    }
