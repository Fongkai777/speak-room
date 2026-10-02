#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-4000}"
PYTHON="${PYTHON:-$ROOT_DIR/.venv/bin/python}"

cd "$ROOT_DIR"

if [[ ! -x "$PYTHON" ]]; then
  echo "Python environment not found: $PYTHON" >&2
  echo "Run: python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt" >&2
  exit 1
fi

listener_pids="$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"

if [[ -n "$listener_pids" ]]; then
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    process_cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"

    if [[ "$process_cwd" != "$ROOT_DIR" || "$command" != *"server.py"* ]]; then
      echo "Port $PORT is used by another program (PID $pid): $command" >&2
      echo "Stop that program or choose another port, for example: PORT=4001 ./run.sh" >&2
      exit 1
    fi

    echo "Stopping existing Speak Room server (PID $pid)..."
    kill "$pid"

    for _ in {1..50}; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.1
    done

    if kill -0 "$pid" 2>/dev/null; then
      echo "The existing server did not stop. Please stop PID $pid manually." >&2
      exit 1
    fi
  done <<< "$listener_pids"
fi

echo "Starting Speak Room at http://127.0.0.1:$PORT"
exec env PORT="$PORT" "$PYTHON" -B server.py
