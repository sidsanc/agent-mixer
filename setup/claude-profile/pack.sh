#!/usr/bin/env bash
# Pack your Claude Code profile into one file, so install-mac.sh can recreate it on
# another Mac as its own command (e.g. `claude-sid`), next to that Mac owner's `claude`.
#   bash setup/claude-profile/pack.sh                          # ~/.claude -> ~/Downloads/claude-profile-kit.tar.gz
#   bash setup/claude-profile/pack.sh --from DIR --out FILE
# Packs: CLAUDE.md, profile/, agents/, commands/, your skills, plugin list, safe settings.
# Leaves out: login, history, sessions, memory, hooks, env, and gstack (installed fresh on the Mac).
# Works in Git Bash on Windows and on macOS.
set -euo pipefail

FROM="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
OUT="$HOME/Downloads/claude-profile-kit.tar.gz"
while [ $# -gt 0 ]; do
  case "$1" in
    --from) FROM="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done
[ -d "$FROM" ] || { echo "No Claude config at $FROM"; exit 1; }
command -v node >/dev/null || { echo "Needs Node.js (to copy settings safely)."; exit 1; }

HERE="$(cd "$(dirname "$0")" && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
KIT="$STAGE/claude-profile-kit"
mkdir -p "$KIT/claude/skills"
cp "$HERE/install-mac.sh" "$KIT/install.sh"

[ -f "$FROM/CLAUDE.md" ] && cp "$FROM/CLAUDE.md" "$KIT/claude/"
for d in profile agents commands; do
  [ -d "$FROM/$d" ] && tar -C "$FROM" -chf - "$d" | tar -C "$KIT/claude" -xf -
done

# Skills: everything except gstack, the skills gstack generates (its setup recreates them)
# and claude.ai-synced skills (they come back when you sign in). -h follows symlinks.
packed=0
for d in "$FROM"/skills/*/; do
  n="$(basename "$d")"
  case "$n" in gstack|synced|_gstack-command|connect-chrome) continue ;; esac
  [ -e "$FROM/skills/gstack/$n/SKILL.md" ] && continue
  [ -e "$d/SKILL.md" ] || continue
  tar -C "$FROM/skills" -chf - --exclude=.git --exclude=node_modules "$n" | tar -C "$KIT/claude/skills" -xf -
  packed=$((packed + 1))
done

# Settings: keep preferences and plugins; drop hooks (machine paths), env and permissions.
node -e '
const fs = require("fs");
const [src, dst] = process.argv.slice(1);
let s = {};
try { s = JSON.parse(fs.readFileSync(src, "utf8")); } catch {}
const keep = ["model", "theme", "enabledPlugins", "extraKnownMarketplaces", "enableWorkflows",
  "autoUpdatesChannel", "agentPushNotifEnabled", "skipDangerousModePermissionPrompt"];
const out = {};
for (const k of keep) if (k in s) out[k] = s[k];
fs.writeFileSync(dst, JSON.stringify(out, null, 2) + "\n");
' "$FROM/settings.json" "$KIT/claude/settings.json"

if grep -rIlE 'sk-ant-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|lin_api_[A-Za-z0-9]{20,}' "$KIT" >/dev/null 2>&1; then
  echo "Stopped: these files look like they hold a key. Remove the key, then pack again:"
  grep -rIlE 'sk-ant-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|lin_api_[A-Za-z0-9]{20,}' "$KIT"
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
tar -C "$STAGE" -czf "$OUT" claude-profile-kit
echo "Packed $packed skills, $(ls "$KIT/claude/agents" 2>/dev/null | wc -l | tr -d ' ') agents, CLAUDE.md and settings."
echo "Kit: $OUT ($(du -h "$OUT" | cut -f1))"
echo "On the Mac: tar -xzf claude-profile-kit.tar.gz && bash claude-profile-kit/install.sh --name sid"
