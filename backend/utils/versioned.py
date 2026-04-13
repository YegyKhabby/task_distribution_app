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
    return the rows belonging to the latest version active for week_start_str.

    A "version" is all rows sharing the same valid_from date.  The latest
    version whose valid_from <= week_start_str wins completely — days not
    present in that version are treated as 0h (no fallback to older versions).
    """
    filtered = [
        r for r in rows
        if (r.get("valid_from") or "2000-01-01") <= week_start_str
        and (r.get("valid_until") is None or r["valid_until"] >= week_start_str)
    ]
    if not filtered:
        return []
    latest_version = max(r.get("valid_from") or "2000-01-01" for r in filtered)
    version_rows = [r for r in filtered if (r.get("valid_from") or "2000-01-01") == latest_version]
    return _latest_by(version_rows, lambda r: (r.get("person_id", ""), r["day_of_week"]))


def active_distribution_rows(rows, week_start_str: str) -> list:
    """
    From a list of task_distribution rows (with valid_from),
    return the rows belonging to the latest saved version active for
    week_start_str.

    A "version" is all distribution rows sharing the same valid_from date.
    The latest version whose valid_from <= week_start_str wins completely.
    Rows missing from that version are treated as 0h, so we must not fall
    back to older versions task-by-task.
    """
    filtered = [r for r in rows if (r.get("valid_from") or "2000-01-01") <= week_start_str]
    if not filtered:
        return []
    latest_version = max(r.get("valid_from") or "2000-01-01" for r in filtered)
    version_rows = [r for r in filtered if (r.get("valid_from") or "2000-01-01") == latest_version]
    return _latest_by(version_rows, lambda r: (r["person_id"], r["task_id"], r.get("week_number", "")))
