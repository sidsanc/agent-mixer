#!/usr/bin/env bash
# One-command Mac setup for the Agent Mixer team.
#   ./setup/mac.sh --role engineer                 # Siddhant: everything, including Terse + Agent Relay
#   ./setup/mac.sh --role product --agent codex    # Julius on Codex: Codex, design skills, Linear
#   --agent claude (default) | codex | both        # which coding agent to set up
# Safe to re-run: every step skips what's already installed.
# Separate Claude profile (e.g. claude-sid on a shared Mac): CLAUDE_CONFIG_DIR=~/.claude-sid ./setup/mac.sh ...
set -euo pipefail

ROLE=""
AGENT="claude"
while [ $# -gt 0 ]; do
  case "$1" in
    --role) ROLE="${2:-}"; shift 2 ;;
    --agent) AGENT="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,7p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done
if [ "$ROLE" != "engineer" ] && [ "$ROLE" != "product" ]; then
  echo "Pick a role: ./setup/mac.sh --role engineer   or   ./setup/mac.sh --role product"
  exit 1
fi
case "$AGENT" in
  claude|codex|both) ;;
  *) echo "Pick an agent: --agent claude, --agent codex or --agent both"; exit 1 ;;
esac
[ "$(uname -s)" = "Darwin" ] || { echo "This script is for macOS."; exit 1; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=versions.env
source "$REPO_ROOT/setup/versions.env"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok()   { printf '    ok: %s\n' "$1"; }
warn() { printf '    \033[33mwarning:\033[0m %s\n' "$1"; WARNINGS+=("$1"); }
have() { command -v "$1" >/dev/null 2>&1; }
want() { [ "$AGENT" = "$1" ] || [ "$AGENT" = "both" ]; }
WARNINGS=()
# Claude's config folder; a separate profile sets CLAUDE_CONFIG_DIR (see setup/claude-profile/).
CLAUDE_HOME="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

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

if want claude; then
  step "Claude Code"
  if ! have claude; then
    curl -fsSL https://claude.ai/install.sh | bash || npm install -g @anthropic-ai/claude-code
    export PATH="$HOME/.local/bin:$PATH"
  fi
  have claude && ok "$(claude --version)" || warn "Claude Code not on PATH; open a new terminal and run: claude --version"

  step "gstack for Claude (Garry Tan's YC skills), team mode"
  if [ ! -d "$HOME/.claude/skills/gstack/.git" ]; then
    git clone --single-branch --depth 1 "$GSTACK_REPO" "$CLAUDE_HOME/skills/gstack"
  fi
  ( cd "$CLAUDE_HOME/skills/gstack" && ./setup --team -q ) || warn "gstack setup failed; rerun: cd $CLAUDE_HOME/skills/gstack && ./setup --team"
  ok "gstack installed for Claude"

  step "Claude Code plugins"
  claude plugin install frontend-design@claude-plugins-official >/dev/null 2>&1 \
    && ok "frontend-design" || warn "frontend-design plugin: install inside Claude Code with /plugin"
fi

if want codex; then
  step "Codex CLI"
  if ! have codex; then
    npm install -g @openai/codex >/dev/null || brew install codex >/dev/null || true
  fi
  have codex && ok "$(codex --version)" || warn "Codex not on PATH; install with: npm install -g @openai/codex"

  step "gstack for Codex (Garry Tan's YC skills)"
  # gstack keeps its checkout outside ~/.codex and installs gstack-* skills into ~/.codex/skills.
  GSTACK_CODEX_DIR="$HOME/gstack"
  [ -d "$CLAUDE_HOME/skills/gstack/.git" ] && GSTACK_CODEX_DIR="$CLAUDE_HOME/skills/gstack"
  if [ ! -d "$GSTACK_CODEX_DIR/.git" ]; then
    git clone --single-branch --depth 1 "$GSTACK_REPO" "$GSTACK_CODEX_DIR"
  fi
  ( cd "$GSTACK_CODEX_DIR" && ./setup --host codex -q ) || warn "gstack for Codex failed; rerun: cd $GSTACK_CODEX_DIR && ./setup --host codex"
  ok "gstack installed for Codex (ask for gstack-office-hours, gstack-design-shotgun, ...)"
fi

step "Design and frontend skills"
# Same sources as Siddhant's machine (from ~/.agents/.skill-lock.json)
SKILL_SOURCES=(pbakaus/impeccable Leonxlnx/taste-skill emilkowalski/skills vercel-labs/skills)
SKILL_AGENTS=()
# The skills CLI writes to ~/.claude; a separate profile gets its skills from its kit instead.
if want claude; then
  if [ -n "${CLAUDE_CONFIG_DIR:-}" ]; then ok "Claude: skipped (profile $CLAUDE_HOME brings its own skills)"
  else SKILL_AGENTS+=(claude-code); fi
fi
want codex && SKILL_AGENTS+=(codex)
for a in ${SKILL_AGENTS[@]+"${SKILL_AGENTS[@]}"}; do
  for src in "${SKILL_SOURCES[@]}"; do
    npx -y skills add "$src" -g -a "$a" -y >/dev/null 2>&1 \
      && ok "$src ($a)" || warn "skills from $src: run 'npx skills add $src -g -a $a'"
  done
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

step "Linear connection"
# Claude reads .mcp.json; Codex reads .codex/config.toml once the folder is trusted.
want claude && ok "Claude: Linear is declared in .mcp.json (sign in once from Claude Code with /mcp)"
want codex && ok "Codex: Linear is declared in .codex/config.toml (sign in once with: codex mcp login linear)"

step "Done"
if [ ${#WARNINGS[@]} -gt 0 ]; then
  echo "Finished with ${#WARNINGS[@]} warning(s):"
  for w in "${WARNINGS[@]}"; do echo "  - $w"; done
fi
echo
echo "Next steps (one time):"
echo "  1. gh auth login                      # sign in to GitHub"
if want claude; then
  echo "  2. cd \"$REPO_ROOT\" && claude          # start Claude Code in this repo"
  echo "     In Claude Code: /mcp -> linear -> Authenticate"
fi
if want codex; then
  echo "  2. cd \"$REPO_ROOT\" && codex           # start Codex here; sign in with ChatGPT; trust this folder"
  echo "     Then, in a terminal in this folder: codex mcp login linear"
  echo "     (Or open this folder in the Codex app; it uses the same config.)"
fi
echo "  3. ./setup/verify.sh                  # check everything"
[ "$ROLE" = "engineer" ] && echo "  4. Fill in .env, then: terse login (or create a key at app.useterse.ai) and relay init --hosted"
exit 0
