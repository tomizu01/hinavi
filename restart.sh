#!/bin/bash
set -e

cd "$(dirname "$0")"

# port 6500 (tabikoto) を停止
PID=$(ss -tlnp | grep ':6500 ' | grep -oP 'pid=\K[0-9]+' || true)
if [ -n "$PID" ]; then
  echo "Stopping tabikoto on port 6500 (PID: $PID)..."
  kill "$PID" || true
  for i in $(seq 1 20); do
    ss -tlnp | grep -q ':6500 ' || break
    sleep 0.5
  done
  PID=$(ss -tlnp | grep ':6500 ' | grep -oP 'pid=\K[0-9]+' || true)
  if [ -n "$PID" ]; then
    echo "Force killing PID: $PID..."
    kill -9 "$PID"
    sleep 1
  fi
fi

echo "Building tabikoto..."
npm run build:tabikoto

echo "Starting tabikoto..."
LOGFILE="/var/log/hinavi/server-$(date +%Y%m%d-%H%M%S).log"
nohup npm run start:tabikoto > "$LOGFILE" 2>&1 &
disown
echo "log: $LOGFILE"
