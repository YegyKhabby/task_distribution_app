# Week Scope Simplification + Weekly Hours Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the confusing `week_scope` multi-value field with a simple `repeats_weekly` boolean, and fix `impact.py` to compute weekly hours from `person_schedule` instead of a stale DB column.

**Architecture:** Two independent fixes. Fix 1 is pure backend + frontend (no DB migration needed beyond adding a column and migrating data). Fix 2 is a surgical change to `impact.py` only — fetch `person_schedule` for all people in scope and build a `weekly_hours_map` to replace all DB column reads.

**Tech Stack:** Python/FastAPI backend, React/JSX frontend, Supabase (PostgreSQL)

**Spec:** `docs/superpowers/specs/2026-04-13-week-scope-and-weekly-hours-fix-design.md`

---

## Task 1: Migrate `week_scope` → `repeats_weekly` in the database

**Files:**
- Modify: `backend/schema.sql` (update tasks table definition)

No automated test for the DB migration itself — verify manually.

- [ ] **Step 1: Run the migration in Supabase SQL editor**

Open the Supabase dashboard → SQL editor and run:

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS repeats_weekly boolean NOT NULL DEFAULT true;
UPDATE tasks SET repeats_weekly = (week_scope = 'both');
```

Do NOT drop `week_scope` yet — the backend still reads it. That happens in Task 2.

- [ ] **Step 2: Verify the migration**

In Supabase SQL editor:

```sql
SELECT name, week_scope, repeats_weekly FROM tasks ORDER BY name;
```

Expected: all tasks that had `week_scope = 'both'` now have `repeats_weekly = true`; `Automation CB & Travel reports` and `Invoice - CB` have `repeats_weekly = false`.

- [ ] **Step 3: Update `schema.sql` to reflect the new column**

In `backend/schema.sql`, replace the tasks table definition. Change:

```sql
-- Tasks (manager defines these)
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  priority int,
  color text,
  weekly_hours_target numeric not null default 0,  -- total hrs/week the task needs
  created_at timestamptz default now()
);
```

To:

```sql
-- Tasks (manager defines these)
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  priority int,
  color text,
  weekly_hours_target numeric not null default 0,  -- total hrs/week the task needs
  repeats_weekly boolean not null default true,     -- false = only runs in weeks with explicit assignments
  created_at timestamptz default now()
);
```

- [ ] **Step 4: Commit**

```bash
git add backend/schema.sql
git commit -m "feat: add repeats_weekly column to tasks (migration done in Supabase)"
```

---

## Task 2: Update backend models and distribute filter

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/routers/distribute.py`

- [ ] **Step 1: Update `models.py` — swap `week_scope` for `repeats_weekly`**

In `backend/models.py`, in `TaskCreate`, replace:

```python
week_scope: str = "both"  # "both" | "W1" | "W234"
```

With:

```python
repeats_weekly: bool = True
```

In `TaskUpdate`, replace:

```python
week_scope: Optional[str] = None
```

With:

```python
repeats_weekly: Optional[bool] = None
```

- [ ] **Step 2: Update `distribute.py` — replace scope filter**

In `backend/routers/distribute.py`, in `compute_preview`, replace the block at lines 132–155:

```python
week_scope_filter = f"W{week_number}"

person_map = {p["id"]: p for p in people}

task_assigned: dict[str, set] = defaultdict(set)
for a in assignments:
    task_assigned[a["task_id"]].add(a["person_id"])

fixed_map: dict[tuple, float] = {}
for f in fixed_rows:
    fixed_map[(f["task_id"], f["person_id"])] = f["hours"]

# Total weekly capacity per person
capacity = {p["id"]: compute_weekly_hours(p) for p in people}

# Separate normal tasks from fill tasks, respect week_scope
normal_tasks = []
fill_tasks = []
for t in tasks:
    scope = t.get("week_scope", "both")
    if scope != "both" and scope != week_scope_filter:
        # legacy W234: matches weeks 2, 3, 4
        if not (scope == "W234" and week_number in (2, 3, 4)):
            continue
    if t.get("is_fill"):
```

With:

```python
person_map = {p["id"]: p for p in people}

task_assigned: dict[str, set] = defaultdict(set)
for a in assignments:
    task_assigned[a["task_id"]].add(a["person_id"])

fixed_map: dict[tuple, float] = {}
for f in fixed_rows:
    fixed_map[(f["task_id"], f["person_id"])] = f["hours"]

# Total weekly capacity per person
capacity = {p["id"]: compute_weekly_hours(p) for p in people}

# Separate normal tasks from fill tasks
# repeats_weekly=False tasks are only included if they have assignments this week
normal_tasks = []
fill_tasks = []
for t in tasks:
    if not t.get("repeats_weekly", True):
        if not task_assigned.get(t["id"]):
            continue
    if t.get("is_fill"):
```

- [ ] **Step 3: Verify the distribute preview still works**

Start the backend:
```bash
cd backend && uvicorn main:app --reload
```

In a browser or curl, hit:
```
GET /api/distribute/preview?week_number=1
GET /api/distribute/preview?week_number=2
```

For week 1: `Automation CB & Travel reports` should appear (it has assignments for week 1).
For week 2: `Invoice - CB` should appear (has assignments), `Automation CB & Travel reports` should NOT (no assignments for week 2, `repeats_weekly=false`).

- [ ] **Step 4: Drop `week_scope` column from DB**

Once the backend no longer reads `week_scope`, run in Supabase SQL editor:

```sql
ALTER TABLE tasks DROP COLUMN week_scope;
```

- [ ] **Step 5: Commit**

```bash
git add backend/models.py backend/routers/distribute.py
git commit -m "feat: replace week_scope with repeats_weekly in models and distribute filter"
```

---

## Task 3: Update the frontend task form

**Files:**
- Modify: `frontend/src/pages/Manager.jsx`

- [ ] **Step 1: Update initial form state**

In `Manager.jsx`, find the two `useState` / `setForm` calls that initialize the task form. They currently include `week_scope: 'both'`. Replace with `repeats_weekly: true`.

First occurrence (around line 153):
```jsx
const [form, setForm] = useState({ name: '', weekly_hours_target: '', color: COLORS[0], priority: '', repeats_weekly: true, is_fill: false, responsible_person: '', schedule_rule: '', split_equally: false })
```

Second occurrence (new task default, around line 258):
```jsx
setForm({ name: '', weekly_hours_target: '', color: COLORS[Math.floor(Math.random() * COLORS.length)], priority: tasks.length + 1, repeats_weekly: true, is_fill: false, responsible_person: '', schedule_rule: '', split_equally: false })
```

Third occurrence (edit task, around line 264):
```jsx
setForm({ name: t.name, weekly_hours_target: t.weekly_hours_target, color: t.color || COLORS[0], priority: t.priority || '', repeats_weekly: t.repeats_weekly !== false, is_fill: t.is_fill || false, responsible_person: t.responsible_person || '', schedule_rule: t.schedule_rule || '', split_equally: t.split_equally || false })
```

Note: `t.repeats_weekly !== false` handles any tasks where the field is missing (defaults to true).

- [ ] **Step 2: Update the save handler**

Find the save/update call around line 274. Replace:

```jsx
week_scope: form.week_scope,
```

With:

```jsx
repeats_weekly: form.repeats_weekly,
```

- [ ] **Step 3: Replace the `week_scope` dropdown with a toggle**

Find the `week_scope` dropdown in the task form. It looks like a `<select>` with options for `both`, `W1`, `W234`, etc. Replace the entire dropdown with:

```jsx
<div className="flex flex-col gap-1">
  <span className="text-xs text-gray-400">Week scope</span>
  <label className="flex items-center gap-2 h-[34px] cursor-pointer">
    <input
      type="checkbox"
      checked={form.repeats_weekly}
      onChange={(e) => setForm({ ...form, repeats_weekly: e.target.checked })}
      className="w-4 h-4 rounded text-indigo-600"
    />
    <span className="text-sm text-gray-700">Repeats every week</span>
  </label>
</div>
```

- [ ] **Step 4: Verify in the browser**

- Open the Manager page → Tasks tab
- Click "Add task" — the form should show a "Repeats every week" checkbox (checked by default)
- Edit an existing task — checkbox should reflect its `repeats_weekly` value
- Edit `Automation CB & Travel reports` — checkbox should be unchecked

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Manager.jsx
git commit -m "feat: replace week_scope dropdown with repeats_weekly toggle in task form"
```

---

## Task 4: Fix `weekly_hours` in `impact.py`

**Files:**
- Modify: `backend/routers/impact.py`

- [ ] **Step 1: Add a bulk schedule fetch after `dist_all` is built**

In `backend/routers/impact.py`, after line 89 (`dist_all = active_distribution_rows(...)`), insert:

```python
# Compute weekly hours from person_schedule (not the stale people.weekly_hours column)
all_pids = list({d["person_id"] for d in dist_all})
if all_pids:
    sched_res_bulk = supabase.table("person_schedule").select(
        "person_id, hours, valid_from, valid_until"
    ).in_("person_id", all_pids).execute()
    sched_rows_bulk = sched_res_bulk.data
else:
    sched_rows_bulk = []

# Build weekly_hours_map: {person_id: float} using versioned active rows
weekly_hours_map: dict[str, float] = {}
for pid in all_pids:
    rows = [{**r, "person_id": pid} for r in sched_rows_bulk if r["person_id"] == pid]
    active = active_schedule_rows(rows, week_start_str)
    weekly_hours_map[pid] = sum(r["hours"] for r in active)
```

- [ ] **Step 2: Replace the three stale `weekly_hours` reads**

**Replace line 111** (inside the `task_people` index loop):

```python
# OLD:
"weekly_hours": d["people"]["weekly_hours"],

# NEW:
"weekly_hours": weekly_hours_map.get(d["person_id"], 0.0),
```

**Replace line 120** (spare hours calculation):

```python
# OLD:
weekly = dist_entry["people"]["weekly_hours"]

# NEW:
weekly = weekly_hours_map.get(pid, 0.0)
```

**Replace line 216** (result append):

```python
# OLD:
"weekly_hours": person["weekly_hours"],

# NEW:
"weekly_hours": weekly_hours_map.get(pid, 0.0),
```

- [ ] **Step 3: Remove `weekly_hours` from the two Supabase join selects**

**Line 45**, change:

```python
"*, people(id, name, weekly_hours)"
```

To:

```python
"*, people(id, name)"
```

**Line 87**, change:

```python
"*, people(id, name, weekly_hours), tasks(id, name, color, priority, schedule_rule, is_fill)"
```

To:

```python
"*, people(id, name), tasks(id, name, color, priority, schedule_rule, is_fill)"
```

- [ ] **Step 4: Verify the fix**

Start the backend and hit the impact endpoint for a week that has absences. Check that the `weekly_hours` values in the response match the person's actual schedule sum (not 20).

You can also run a quick manual check:

```bash
cd backend && python3 -c "
import sys; sys.path.insert(0, '.')
from dotenv import load_dotenv; load_dotenv('.env')
import os
from supabase import create_client
sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_KEY'])
people = sb.table('people').select('name, weekly_hours').order('name').execute().data
sched = sb.table('person_schedule').select('person_id, hours').execute().data
from collections import defaultdict
s = defaultdict(float)
for r in sched: s[r['person_id']] += r['hours']
pid_map = {p['name']: p for p in sb.table('people').select('id,name').execute().data}
for p in people:
    pid = next((x['id'] for x in sb.table('people').select('id,name').execute().data if x['name'] == p['name']), None)
    print(p['name'], 'DB:', p['weekly_hours'], 'Schedule:', s.get(pid, 0))
"
```

The impact endpoint should now return the schedule-derived value for each person.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/impact.py
git commit -m "fix: compute weekly_hours from person_schedule in impact.py, not stale DB column"
```

---

## Task 5: Fix `seed.py`

**Files:**
- Modify: `backend/seed.py`

- [ ] **Step 1: Remove `weekly_hours` from the people insert**

In `backend/seed.py`, the `PEOPLE` list has hardcoded `weekly_hours`. Remove that field and update the insert:

Replace:

```python
PEOPLE = [
    {"name": "Andrian",  "weekly_hours": 16},
    {"name": "Anisha",   "weekly_hours": 20},
    {"name": "Ayesha",   "weekly_hours": 20},
    {"name": "Can",      "weekly_hours": 20},
    {"name": "Maira",    "weekly_hours": 20},
    {"name": "Moinul",   "weekly_hours": 20},
    {"name": "Rohit",    "weekly_hours": 20},
    {"name": "Sidrit",   "weekly_hours": 20},
    {"name": "Yeganeh",  "weekly_hours": 20},
]
```

With:

```python
PEOPLE = [
    {"name": "Andrian"},
    {"name": "Anisha"},
    {"name": "Ayesha"},
    {"name": "Can"},
    {"name": "Maira"},
    {"name": "Moinul"},
    {"name": "Rohit"},
    {"name": "Sidrit"},
    {"name": "Yeganeh"},
]
```

Replace the insert call:

```python
people_res = sb.table("people").insert(
    [{"name": p["name"], "weekly_hours": p["weekly_hours"]} for p in PEOPLE]
).execute()
```

With:

```python
people_res = sb.table("people").insert(
    [{"name": p["name"]} for p in PEOPLE]
).execute()
```

- [ ] **Step 2: Commit**

```bash
git add backend/seed.py
git commit -m "fix: remove hardcoded weekly_hours from seed.py (derived from person_schedule)"
```

---

## Self-review

**Spec coverage:**
- ✅ `repeats_weekly` DB column added and migrated (Task 1)
- ✅ `week_scope` dropped from DB (Task 2)
- ✅ `models.py` updated (Task 2)
- ✅ `distribute.py` filter replaced (Task 2)
- ✅ Frontend form updated (Task 3)
- ✅ `impact.py` weekly_hours fixed (Task 4)
- ✅ `seed.py` cleaned up (Task 5)

**Files not touched (confirmed safe):**
- `distribute.py` confirm endpoint — does not read `week_scope`
- `calendar.py` — does not use `week_scope` or `weekly_hours`
- `people.py` — already correct, untouched
- All other routers — do not reference `week_scope` or `people.weekly_hours`
