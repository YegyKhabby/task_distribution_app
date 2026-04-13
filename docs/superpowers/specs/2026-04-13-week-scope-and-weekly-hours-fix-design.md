# Design: Simplify Week Scope + Fix Weekly Hours in Impact

**Date:** 2026-04-13

---

## Problem Summary

Two independent bugs causing incorrect behaviour:

1. **`week_scope` is overly complex.** The task model has a `week_scope` field with values `"both"`, `"W1"`, `"W2"`, `"W3"`, `"W4"`, `"W234"`. In practice only `"both"`, `"W1"`, and `"W234"` are used, and the concept is confusing. The real intent is simple: does this task repeat every week, or is it specific to certain weeks (configured via assignments)?

2. **`people.weekly_hours` DB column is stale.** It was seeded with hardcoded values in March 2026 (correct at the time) but was never kept in sync as schedules changed. `impact.py` reads this column directly from Supabase joins, causing wrong spare-hours calculations for 5 of 9 people. `distribute.py` and `people.py` already compute from `person_schedule` correctly — `impact.py` was missed.

---

## Change 1: Replace `week_scope` with `repeats_weekly` boolean

### Background

The 4 week tabs (W1–W4) in the Assignments UI already allow per-week task configuration. The `week_scope` field was introduced as a shortcut so managers don't have to assign the same task 4 times when it's identical every week. The W2/W3/W4/W234 variants add complexity without value.

### Design

**DB migration (run in Supabase SQL editor):**
```sql
ALTER TABLE tasks ADD COLUMN repeats_weekly boolean NOT NULL DEFAULT true;
UPDATE tasks SET repeats_weekly = (week_scope = 'both');
ALTER TABLE tasks DROP COLUMN week_scope;
```

**`backend/models.py`:** Replace `week_scope: str = "both"` with `repeats_weekly: bool = True` in both `TaskCreate` and `TaskUpdate`.

**`backend/routers/distribute.py`:** Replace the scope filter:
```python
# OLD (complex):
week_scope_filter = f"W{week_number}"
if scope != "both" and scope != week_scope_filter:
    if not (scope == "W234" and week_number in (2, 3, 4)):
        continue

# NEW (simple):
if not t.get("repeats_weekly", True):
    if not task_assigned.get(t["id"]):  # no assignments for this week → skip
        continue
```

**`frontend/src/pages/Manager.jsx`:** Replace the `week_scope` dropdown in the task form with a single toggle:
- Label: "Repeats every week"
- Checked (default) = runs every week
- Unchecked = week-specific (only distributes in weeks where the task has assignments)

Default state for new tasks: checked (repeats every week).

### Data impact

| Task | Current scope | New value |
|---|---|---|
| All 22 "both" tasks | both | repeats_weekly = true |
| Automation CB & Travel reports | W1 | repeats_weekly = false |
| Invoice - CB | W234 | repeats_weekly = false |

Both week-specific tasks already have `task_people` entries for the correct weeks, so their distribution behaviour is unchanged.

### Files changed

- `backend/schema.sql` — update people table comment and tasks table definition
- `backend/models.py` — swap `week_scope` for `repeats_weekly`
- `backend/routers/distribute.py` — replace scope filter logic
- `frontend/src/pages/Manager.jsx` — replace dropdown with toggle; update default form state

---

## Change 2: Fix `weekly_hours` in `impact.py`

### Background

`people.weekly_hours` is a denormalized DB column that was accurate at initial seeding but was never kept in sync. Current mismatches:

| Person | DB column | Actual schedule |
|---|---|---|
| Andrian | 20h | 16h |
| Maira | 20h | 12h |
| Saudamini | 20h | 32h |
| Vikash | 20h | 40h |
| Yeganeh | 20h | 12h |

`distribute.py` and `people.py` already compute from `person_schedule` and are correct. Only `impact.py` reads the stale column.

### Design

In `compute_week_impact` (`impact.py`), after fetching `dist_all`, bulk-fetch `person_schedule` for all person IDs present in `dist_all`. Apply `active_schedule_rows` (already imported) using `week_start_str`. Build:

```python
weekly_hours_map: dict[str, float] = {pid: sum_of_schedule_hours}
```

Replace every reference to `d["people"]["weekly_hours"]` and `person["weekly_hours"]` with `weekly_hours_map.get(pid, 0.0)`.

Remove `weekly_hours` from both Supabase join selects in `impact.py` (lines 45 and 87).

**`seed.py`:** Remove `weekly_hours` from the people insert. The column will remain in the DB for backward compatibility with any direct queries, but `people.py` already overrides it on read and `impact.py` will no longer use it.

### What is NOT changed

- `people.py` — already correct, no change
- `distribute.py` — already correct, no change
- `calendar.py` — does not use `weekly_hours`, no change
- Frontend — already receives the correct value from the people endpoint, no change
- The `people.weekly_hours` DB column — left in place to avoid a migration; just stop relying on it in `impact.py`

### Files changed

- `backend/routers/impact.py` — bulk-fetch schedules, build `weekly_hours_map`, replace 3 usages
- `backend/seed.py` — remove `weekly_hours` from people insert

---

## Out of scope

- Updating the `people.weekly_hours` DB column to stay in sync automatically (not needed once `impact.py` reads from schedule)
- Removing the `weekly_hours` column from the DB (safe to leave, costs nothing)
- Changes to the Calendar, Actual, or Reallocations pages (not affected)
