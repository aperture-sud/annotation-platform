#!/bin/bash
# Installs systemd services so the app starts on boot and restarts on crash.
# Run once with: sudo bash scripts/install-service.sh

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
USER="$(logname 2>/dev/null || echo "$SUDO_USER")"

if [ "$EUID" -ne 0 ]; then
  echo "Run with sudo: sudo bash scripts/install-service.sh"
  exit 1
fi

# Load config
set -a
source "$ROOT/.env"
set +a

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
SERVER_HOST="${SERVER_HOST:-$(hostname -I | awk '{print $1}')}"

# ── Backend service ───────────────────────────────────────────────────────────

cat > /etc/systemd/system/annotation-backend.service << EOF
[Unit]
Description=Annotation Platform Backend
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$ROOT/backend
EnvironmentFile=$ROOT/backend/.env
ExecStart=/home/$USER/.local/bin/uvicorn main:app --host 0.0.0.0 --port $BACKEND_PORT
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# ── Frontend service ──────────────────────────────────────────────────────────

cat > /etc/systemd/system/annotation-frontend.service << EOF
[Unit]
Description=Annotation Platform Frontend
After=network.target annotation-backend.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$ROOT/frontend
Environment=VITE_API_URL=http://$SERVER_HOST:$BACKEND_PORT
ExecStart=/usr/bin/npm run dev -- --host --port $FRONTEND_PORT
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# ── Enable and start ──────────────────────────────────────────────────────────

systemctl daemon-reload
systemctl enable annotation-backend annotation-frontend
systemctl restart annotation-backend annotation-frontend

echo ""
echo "Services installed and started."
echo "App available at: http://$SERVER_HOST:$FRONTEND_PORT"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status annotation-backend"
echo "  sudo systemctl status annotation-frontend"
echo "  sudo journalctl -u annotation-backend -f"
echo "  sudo journalctl -u annotation-frontend -f"
