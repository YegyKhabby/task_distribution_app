#!/usr/bin/env python3
import json
import subprocess
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATE_PATH = ROOT / ".deskbird_schedule_state.json"
SEND_SCRIPT = ROOT / "send_deskbird_daily.sh"
SLOTS = [11, 18]  # 11:00 and 18:00 local time


def load_state():
    if not STATE_PATH.exists():
        return {}
    try:
        return json.loads(STATE_PATH.read_text())
    except Exception:
        return {}


def save_state(day: str, slot: int):
    STATE_PATH.write_text(json.dumps({"day": day, "slot": slot}))


def main():
    now = datetime.now()
    today = now.date().isoformat()
    due_slots = [slot for slot in SLOTS if now.hour > slot or (now.hour == slot and now.minute >= 0)]
    if not due_slots:
        print("No slot due yet.")
        return

    latest_due = max(due_slots)
    state = load_state()
    if state.get("day") == today and int(state.get("slot", 0)) >= latest_due:
        print(f"Latest due slot already sent for {today} at {state.get('slot')}:00.")
        return

    subprocess.run([str(SEND_SCRIPT)], check=True)
    save_state(today, latest_due)
    print(f"Marked {today} {latest_due}:00 as sent.")


if __name__ == "__main__":
    main()
