#!/usr/bin/env bash
# One-command Mac setup for the Agent Mixer team.
#   ./setup/mac.sh --role engineer   # Siddhant: everything, including Terse + Agent Relay
#   ./setup/mac.sh --role product    # Julius: Claude Code, design skills, Linear
# Safe to re-run: every step skips what's already installed.
set -euo pipefail

ROLE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --role) ROLE="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done
if [ "$ROLE" != "engineer" ] && [ "$ROLE" != "product" ]; then
  echo "Pick a role: ./setup/mac.sh --role engineer   or   ./setup/mac.sh --role product"
  exit 1
fi
[ "$(uname -s)" = "Darwin" ] || { echo "This script is for macOS."; exit 1; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=versions.env
source "$REPO_ROOT/setup/versions.env"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok()   { printf '    ok: %s\n' "$1"; }
warn() { printf '    \033[33mwarning:\033[0m %s\n' "$1"; WARNINGS+=("$1"); }
have() { command -v "$1" >/dev/null 2>&1; }
WARNINGS=()

step "Homebrew"
if ! have brew; then
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Apple Silicon installs to /opt/homebrew, Intel to /usr/local
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
  grep -q 'brew shellenv' ~/.zprofile 2>/dev/null || echo 'eval "$('"$(command -v brew)"' shellenv)"' >> ~/.zprofile
fi
ok "$(brew --version | head -1)"

step "Core tools: git, GitHub CLI, Node 22, Bun, jq"
brew install git gh jq "$NODE_FORMULA" oven-sh/bun/bun >/dev/null
brew link --overwrite --force "$NODE_FORMULA" >/dev/null 2>&1 || true
ok "node $(node --version), bun $(bun --version), gh $(gh --version | head -1 | awk '{print $3}')"

step "Claude Code"
if ! have claude; then
  curl -fsSL https://claude.ai/install.sh | bash || npm install -g @anthropic-ai/claude-code
  export PATH="$HOME/.local/bin:$PATH"
fi
have claude && ok "$(claude --version)" || warn "Claude Code not on PATH; open a new terminal and run: claude --version"

step "gstack (Garry Tan's YC skills), team mode"
if [ ! -d "$HOME/.claude/skills/gstack/.git" ]; then
  git clone --single-branch --depth 1 "$GSTACK_REPO" "$HOME/.claude/skills/gstack"
fi
( cd "$HOME/.claude/skills/gstack" && ./setup --team -q ) || warn "gstack setup failed; rerun: cd ~/.claude/skills/gstack && ./setup --team"
ok "gstack installed"

step "Claude Code plugins"
claude plugin install frontend-design@claude-plugins-official >/dev/null 2>&1 \
  && ok "frontend-design" || warn "frontend-design plugin: install inside Claude Code with /plugin"

step "Design and frontend skills"
# Same sources as Siddhant's machine (from ~/.agents/.skill-lock.json)
SKILL_SOURCES=(pbakaus/impeccable Leonxlnx/taste-skill emilkowalski/skills vercel-labs/skills)
for src in "${SKILL_SOURCES[@]}"; do
  npx -y skills add "$src" -g -a claude-code -y >/dev/null 2>&1 \
    && ok "$src" || warn "skills from $src: run 'npx skills add $src' and pick Claude Code"
done

if [ "$ROLE" = "engineer" ]; then
  step "Engineer tools: Terse CLI and Agent Relay"
  bunx "terse-cli@${TERSE_CLI_VERSION}" install || warn "Terse CLI install failed; try: bunx terse-cli@latest install"
  npm install -g "agent-relay@${AGENT_RELAY_VERSION}" >/dev/null \
    && ok "agent-relay $(agent-relay --version 2>/dev/null || echo "$AGENT_RELAY_VERSION")" \
    || warn "agent-relay install failed"
  if [ ! -f "$REPO_ROOT/.env" ]; then
    cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
    ok "created .env from .env.example (fill in the keys)"
  fi
fi

step "Linear connection for Claude"
# The repo's .mcp.json declares the Linear server; Claude asks to approve it on first launch.
ok "Linear MCP is declared in .mcp.json (sign in once from Claude Code with /mcp)"

step "Done"
if [ ${#WARNINGS[@]} -gt 0 ]; then
  echo "Finished with ${#WARNINGS[@]} warning(s):"
  for w in "${WARNINGS[@]}"; do echo "  - $w"; done
fi
cat <<EOF

Next steps (one time):
  1. gh auth login                      # sign in to GitHub
  2. cd "$REPO_ROOT" && claude          # start Claude Code in this repo
  3. In Claude Code: /mcp -> linear -> Authenticate   # connects your Linear account
  4. ./setup/verify.sh                  # check everything
EOF
[ "$ROLE" = "engineer" ] && echo "  5. Fill in .env, then: terse login (or create a key at app.useterse.ai) and relay init --hosted"
exit 0
