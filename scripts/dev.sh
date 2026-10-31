#!/usr/bin/env bash
# Start the whole stack: Terse actors (:7100), server (:3001), web (:5173).
# Optional: a self-hosted Agent Relay engine (:8787) when RELAY_BASE_URL is set.
# A service whose port is already listening is reused, not restarted. Ctrl-C stops what this script started.
# Logs: $AM_LOG_DIR (default /tmp)/am-{actors,server,web,relay}.log
L="${AM_LOG_DIR:-/tmp}"; mkdir -p "$L"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIDS=()

cleanup() {
  trap - EXIT INT TERM
  echo; echo "[dev] stopping ${#PIDS[@]} process(es)"
  for p in ${PIDS[@]+"${PIDS[@]}"}; do kill "$p" 2>/dev/null; done
  wait 2>/dev/null
}
trap cleanup EXIT
trap "exit 130" INT TERM

listening() { lsof -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1; }

wait_port() { # port name seconds
  for _ in $(seq 1 "$3"); do listening "$1" && return 0; sleep 1; done
  echo "[dev] WARNING: $2 is not listening on :$1 after $3s (see its log)"; return 1
}

start() { # port name log cmd...
  local port=$1 name=$2 log=$3; shift 3
  if listening "$port"; then echo "[dev] $name already on :$port, reusing"; return; fi
  echo "[dev] starting $name on :$port (log $log)"
  ( cd "$ROOT" && exec "$@" ) >"$log" 2>&1 &
  PIDS+=($!)
}

if [ -n "${RELAY_BASE_URL:-}" ]; then
  case "$RELAY_BASE_URL" in
    *127.0.0.1*|*localhost*)
      start 8787 relay $L/am-relay.log bash -c 'PATH=/opt/homebrew/opt/node@22/bin:$PATH exec npx -y @relaycast/engine@8.16.0 --db apps/server/.relaycast.db --port 8787'
      wait_port 8787 relay 60 ;;
  esac
  export RELAY="${RELAY:-1}"
else
  export RELAY="${RELAY:-0}"
fi

start 7100 actors $L/am-actors.log bash -c 'cd apps/actors && exec terse actor dev'
wait_port 7100 actors 60

export STORE="${STORE:-terse}"
start "${PORT:-3001}" server $L/am-server.log bash -c 'cd apps/server && exec bun src/index.ts'
wait_port "${PORT:-3001}" server 40

start 5173 web $L/am-web.log bash -c 'cd apps/web && exec bun run dev'
wait_port 5173 web 30

echo "[dev] ready: web http://localhost:5173  api http://localhost:${PORT:-3001}/api/health  (STORE=$STORE RELAY=$RELAY)"
if [ ${#PIDS[@]} -eq 0 ]; then echo "[dev] everything was already running; nothing to supervise"; exit 0; fi
tail -n 0 -f $L/am-server.log &
PIDS+=($!)
wait
