from datetime import date, timedelta


def next_monday(d: date) -> date:
    """Return d itself if Monday, otherwise the following Monday."""
    days_ahead = (7 - d.weekday()) % 7
    return d + timedelta(days=days_ahead if days_ahead else 0)


def _latest_by(rows, key_fn, sort_key="valid_from"):
    """Keep the most-recent row per unique key (highest sort_key value)."""
    result = {}
    for row in sorted(rows, key=lambda r: r.get(sort_key) or "2000-01-01"):
        result[key_fn(row)] = row
    return list(result.values())


def active_schedule_rows(rows, week_start_str: str) -> list:
    """
    From a list of person_schedule rows (with valid_from, valid_until),
    return one row per (person_id, day_of_week) — the most recent version
    that is active for the given week_start date.
    """
    filtered = [
        r for r in rows
        if (r.get("valid_from") or "2000-01-01") <= week_start_str
        and (r.get("valid_until") is None or r["valid_until"] >= week_start_str)
    ]
    return _latest_by(filtered, lambda r: (r.get("person_id", ""), r["day_of_week"]))


def active_distribution_rows(rows, week_start_str: str) -> list:
    """
    From a list of task_distribution rows (with valid_from),
    return one row per (person_id, task_id) — the most recent version
    valid for the given week_start date.
    """
    filtered = [r for r in rows if (r.get("valid_from") or "2000-01-01") <= week_start_str]
    return _latest_by(filtered, lambda r: (r["person_id"], r["task_id"]))
