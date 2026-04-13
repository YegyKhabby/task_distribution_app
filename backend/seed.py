#!/usr/bin/env python3
"""
Seed April 2026 data into Supabase.
Run: python seed.py

Adjust the distributions below to match the actual April Excel data.
People and task hours are based on the April task_distribution_weekly_April.xlsx.
"""

import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

# ── People ─────────────────────────────────────────────────────────────────
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

# ── Tasks (in priority order) ───────────────────────────────────────────────
TASKS = [
    {"name": "Info Telephone",                "priority": 1,  "color": "#f97316"},
    {"name": "CB",                            "priority": 2,  "color": "#8b5cf6"},
    {"name": "Travel Reports + Integrity",    "priority": 3,  "color": "#0ea5e9"},
    {"name": "Vendor Forms & COR Tax Forms",  "priority": 4,  "color": "#10b981"},
    {"name": "Data Cleaning",                 "priority": 5,  "color": "#f59e0b"},
    {"name": "Credit Cards",                  "priority": 6,  "color": "#ef4444"},
    {"name": "OPOs",                          "priority": 7,  "color": "#6366f1"},
    {"name": "Reminder and Pre-Collection",   "priority": 8,  "color": "#ec4899"},
    {"name": "Freshdesk Sorting",             "priority": 9,  "color": "#14b8a6"},
    {"name": "APS Can and Sidrit",            "priority": 10, "color": "#a78bfa"},
    {"name": "APS Yeganeh and Moinul",        "priority": 11, "color": "#fb923c"},
    {"name": "Freshdesk Reply",               "priority": 12, "color": "#4ade80"},
]

# ── Distributions ───────────────────────────────────────────────────────────
# Format: (person_name, task_name, W1_hours, W234_hours)
# 0 means not assigned. Adjust these numbers to match the actual April Excel.
DISTRIBUTIONS_RAW = [
    # Andrian (16 hrs/week)
    ("Andrian", "OPOs",                        4, 4),
    ("Andrian", "Reminder and Pre-Collection", 2, 2),
    ("Andrian", "CB",                          4, 4),
    ("Andrian", "Freshdesk Reply",             6, 6),

    # Anisha (20 hrs/week)
    ("Anisha", "OPOs",                         8, 8),
    ("Anisha", "Reminder and Pre-Collection",  6, 6),
    ("Anisha", "Info Telephone",               2, 2),
    ("Anisha", "Freshdesk Sorting",            4, 4),

    # Ayesha (20 hrs/week)
    ("Ayesha", "OPOs",                         4, 4),
    ("Ayesha", "CB",                           4, 4),
    ("Ayesha", "Info Telephone",               2, 2),
    ("Ayesha", "Data Cleaning",                4, 4),
    ("Ayesha", "Freshdesk Reply",              6, 6),

    # Can (20 hrs/week)
    ("Can", "APS Can and Sidrit",              6, 6),
    ("Can", "Info Telephone",                  4, 4),
    ("Can", "CB",                              4, 4),
    ("Can", "Credit Cards",                    4, 4),
    ("Can", "Freshdesk Sorting",               2, 2),

    # Maira (20 hrs/week)
    ("Maira", "OPOs",                          10, 10),
    ("Maira", "CB",                             4,  4),
    ("Maira", "Freshdesk Reply",                6,  6),

    # Moinul (20 hrs/week)
    ("Moinul", "APS Yeganeh and Moinul",       6, 6),
    ("Moinul", "Travel Reports + Integrity",   4, 4),
    ("Moinul", "Data Cleaning",                4, 4),
    ("Moinul", "Freshdesk Reply",              6, 6),

    # Rohit (20 hrs/week)
    ("Rohit", "Info Telephone",                4, 4),
    ("Rohit", "Vendor Forms & COR Tax Forms",  8, 8),
    ("Rohit", "CB",                            4, 4),
    ("Rohit", "Freshdesk Sorting",             4, 4),

    # Sidrit (20 hrs/week)
    ("Sidrit", "APS Can and Sidrit",           6, 6),
    ("Sidrit", "CB",                           4, 4),
    ("Sidrit", "Credit Cards",                 4, 4),
    ("Sidrit", "Freshdesk Reply",              6, 6),

    # Yeganeh (20 hrs/week)
    ("Yeganeh", "APS Yeganeh and Moinul",      6, 6),
    ("Yeganeh", "Info Telephone",              2, 2),
    ("Yeganeh", "Travel Reports + Integrity",  4, 4),
    ("Yeganeh", "Data Cleaning",               4, 4),
    ("Yeganeh", "Freshdesk Reply",             4, 4),
]


def seed():
    print("Seeding people...")
    sb.table("people").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    people_res = sb.table("people").insert(
        [{"name": p["name"]} for p in PEOPLE]
    ).execute()
    people_map = {p["name"]: p["id"] for p in people_res.data}
    print(f"  Inserted {len(people_res.data)} people")

    print("Seeding tasks...")
    sb.table("tasks").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    tasks_res = sb.table("tasks").insert(TASKS).execute()
    tasks_map = {t["name"]: t["id"] for t in tasks_res.data}
    print(f"  Inserted {len(tasks_res.data)} tasks")

    print("Seeding distributions...")
    sb.table("task_distribution").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    dist_rows = []
    for person_name, task_name, w1_hrs, w234_hrs in DISTRIBUTIONS_RAW:
        pid = people_map.get(person_name)
        tid = tasks_map.get(task_name)
        if not pid or not tid:
            print(f"  WARNING: missing id for {person_name} / {task_name}")
            continue
        if w1_hrs > 0:
            dist_rows.append({"person_id": pid, "task_id": tid, "week_number": 1, "hours_per_week": w1_hrs})
        if w234_hrs > 0:
            dist_rows.append({"person_id": pid, "task_id": tid, "week_number": 2, "hours_per_week": w234_hrs})
    sb.table("task_distribution").insert(dist_rows).execute()
    print(f"  Inserted {len(dist_rows)} distribution rows")

    print("Done!")


if __name__ == "__main__":
    seed()
