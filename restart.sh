#!/bin/bash
set -e

cd "$(dirname "$0")"

# ポート6500のプロセスを停止（ss で検出）
PID=$(ss -tlnp | grep ':6500 ' | grep -oP 'pid=\K[0-9]+' || true)
if [ -n "$PID" ]; then
  echo "Stopping process on port 6500 (PID: $PID)..."
  kill "$PID"
  for i in $(seq 1 20); do
    if ! ss -tlnp | grep -q ':6500 '; then
      break
    fi
    sleep 0.5
  done
  # まだ残っていれば強制終了
  PID=$(ss -tlnp | grep ':6500 ' | grep -oP 'pid=\K[0-9]+' || true)
  if [ -n "$PID" ]; then
    echo "Force killing PID: $PID..."
    kill -9 "$PID"
    sleep 1
  fi
fi

echo "Building..."
npm run build

echo "Starting production server..."
LOGFILE="/var/log/hinavi/server-$(date +%Y%m%d-%H%M%S).log"
nohup npm run start > "$LOGFILE" 2>&1 &
