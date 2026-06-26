#!/bin/bash
# Starts the backend and frontend. Press Ctrl+C to stop both.
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Load config
set -a
source "$ROOT/.env"
set +a

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
SERVER_HOST="${SERVER_HOST:-$(hostname -I | awk '{print $1}')}"

echo "Backend  → http://0.0.0.0:$BACKEND_PORT"
echo "Frontend → http://0.0.0.0:$FRONTEND_PORT"
echo "Open on any device: http://$SERVER_HOST:$FRONTEND_PORT"
echo ""

# Start backend
cd "$ROOT/backend"
~/.local/bin/uvicorn main:app --host 0.0.0.0 --port "$BACKEND_PORT" --reload &
BACKEND_PID=$!

# Start frontend
cd "$ROOT/frontend"
/usr/bin/npm run dev -- --host --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

trap "echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait
