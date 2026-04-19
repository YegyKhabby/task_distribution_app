#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
ROOT_DIR="${SCRIPT_DIR:h}"

cd "$ROOT_DIR"
set -a
source "$SCRIPT_DIR/.env"
set +a

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" && -n "${SUPABASE_SERVICE_KEY:-}" ]]; then
  export SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_KEY"
fi

backend/venv/bin/python "$SCRIPT_DIR/deskbird_report.py" --from-supabase --days 7
