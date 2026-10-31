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
gstack_installed() { [ -d "$HOME/.claude/skills/gstack/bin" ] && echo installed; }
check gstack gstack_installed
check terse terse --version
check agent-relay agent-relay --version
echo "GitHub login:"
gh auth status >/dev/null 2>&1 && echo "  ✓ signed in" || echo "  ✗ run: gh auth login"
echo "Repo config:"
for f in CLAUDE.md .mcp.json .claude/settings.json; do
  [ -f "$REPO_ROOT/$f" ] && echo "  ✓ $f" || echo "  ✗ $f missing"
done
echo "Subagents: $(ls "$REPO_ROOT/.claude/agents" 2>/dev/null | grep -c '\.md$')"
[ -f "$REPO_ROOT/.env" ] && echo "  ✓ .env present" || echo "  (no .env — engineer only)"
