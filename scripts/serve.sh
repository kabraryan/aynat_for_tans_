#!/bin/bash
# Boots the full Aynat stack: Colima (Docker) -> Postgres -> app on :3000.
# Run by the com.aryankabra.aynat LaunchAgent at login; safe to run by hand.
set -e

# launchd provides a minimal PATH; include homebrew (pnpm/colima/docker)
# and ~/.local/bin (the `claude` CLI the extraction backend spawns).
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cd "$(dirname "$0")/.."

# 1. Docker runtime (idempotent; no-op when already running)
colima start >/dev/null 2>&1 || true
for _ in $(seq 1 60); do
  docker info >/dev/null 2>&1 && break
  sleep 2
done

# 2. Database
docker compose up -d
until docker compose exec -T db pg_isready -U aynat -d aynat >/dev/null 2>&1; do
  sleep 1
done

# 3. Take over port 3000 from any leftover dev server (only Aynat uses it)
lsof -iTCP:3000 -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

# 4. App — exec so launchd supervises the server process itself
exec pnpm dev
