#!/usr/bin/env bash
# Prints what's installed so both Macs can be checked in 10 seconds.
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
check() {
  local name="$1"; shift
  if out="$("$@" 2>/dev/null | head -1)" && [ -n "$out" ]; then
    printf '  \033[32m✓\033[0m %-14s %s\n' "$name" "$out"
  else
    printf '  \033[31m✗\033[0m %-14s missing\n' "$name"
  fi
}
echo "Tools:"
check git git --version
check gh gh --version
check node node --version
check bun bun --version
check claude claude --version
check codex codex --version
gstack_installed() { [ -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/gstack/bin" ] && echo "installed for Claude"; }
check gstack gstack_installed
gstack_codex() { ls -d "${CODEX_HOME:-$HOME/.codex}"/skills/gstack-* >/dev/null 2>&1 && echo "installed for Codex"; }
check gstack-codex gstack_codex
check terse terse --version
check agent-relay agent-relay --version
echo "GitHub login:"
gh auth status >/dev/null 2>&1 && echo "  ✓ signed in" || echo "  ✗ run: gh auth login"
echo "Repo config:"
for f in CLAUDE.md AGENTS.md .mcp.json .codex/config.toml .claude/settings.json; do
  [ -f "$REPO_ROOT/$f" ] && echo "  ✓ $f" || echo "  ✗ $f missing"
done
echo "(Claude needs claude + gstack; Codex needs codex + gstack-codex. One of the two is enough.)"
echo "Subagents / playbooks: $(ls "$REPO_ROOT/.claude/agents" 2>/dev/null | grep -c '\.md$')"
[ -f "$REPO_ROOT/.env" ] && echo "  ✓ .env present" || echo "  (no .env — engineer only)"
