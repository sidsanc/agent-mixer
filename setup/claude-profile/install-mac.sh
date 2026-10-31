#!/usr/bin/env bash
# Install a packed Claude Code profile as its own command on this Mac.
#   bash install.sh --name sid        # adds `claude-sid`, with its config in ~/.claude-sid
# The Mac owner's own `claude` (~/.claude) is not touched: separate login, history,
# settings, skills and Keychain entry. Safe to re-run: it updates and skips what's there.
set -euo pipefail

NAME="sid"
while [ $# -gt 0 ]; do
  case "$1" in
    --name) NAME="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done
case "$NAME" in ""|*[!a-z0-9-]*) echo "Use a short lowercase name, e.g. --name sid"; exit 1 ;; esac
[ "$(uname -s)" = "Darwin" ] || { echo "This script is for macOS."; exit 1; }

KIT="$(cd "$(dirname "$0")" && pwd)"
[ -d "$KIT/claude" ] || { echo "Run this from the unpacked kit (claude-profile-kit/install.sh)."; exit 1; }
CONFIG="$HOME/.claude-$NAME"
BIN="$HOME/.local/bin"
GSTACK_REPO="https://github.com/garrytan/gstack.git"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok()   { printf '    ok: %s\n' "$1"; }
warn() { printf '    \033[33mwarning:\033[0m %s\n' "$1"; WARNINGS+=("$1"); }
have() { command -v "$1" >/dev/null 2>&1; }
WARNINGS=()

step "Homebrew"
if ! have brew; then
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
  grep -q 'brew shellenv' ~/.zprofile 2>/dev/null || echo 'eval "$('"$(command -v brew)"' shellenv)"' >> ~/.zprofile
fi
ok "$(brew --version | head -1)"

step "Tools: git, Node, Bun"
have git  || brew install git >/dev/null
have node || brew install node >/dev/null
if have bun; then
  # gstack needs a recent Bun; an old one stalls its setup.
  brew upgrade oven-sh/bun/bun >/dev/null 2>&1 || bun upgrade >/dev/null 2>&1 || true
else
  brew install oven-sh/bun/bun >/dev/null
fi
ok "node $(node --version), bun $(bun --version)"

step "Claude Code"
export PATH="$BIN:$PATH"
have claude || curl -fsSL https://claude.ai/install.sh | bash
have claude && ok "$(claude --version)" || { echo "Claude Code did not install. Run: curl -fsSL https://claude.ai/install.sh | bash"; exit 1; }

step "Profile files -> $CONFIG"
mkdir -p "$CONFIG"
rsync -a --exclude settings.json "$KIT/claude/" "$CONFIG/"
[ -f "$CONFIG/settings.json" ] || cp "$KIT/claude/settings.json" "$CONFIG/settings.json"
# CLAUDE.md may point at ~/.claude/...; on this Mac those files live in the profile folder.
[ -f "$CONFIG/CLAUDE.md" ] && sed -i '' "s#~/\.claude/#~/.claude-$NAME/#g" "$CONFIG/CLAUDE.md"
ok "$(ls "$CONFIG/skills" | wc -l | tr -d ' ') skills, $(ls "$CONFIG/agents" 2>/dev/null | wc -l | tr -d ' ') agents"

# Everything below writes into this profile, never into ~/.claude.
export CLAUDE_CONFIG_DIR="$CONFIG"
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL ANTHROPIC_MODEL

step "gstack (Garry Tan's YC skills)"
if [ ! -e "$CONFIG/skills/gstack" ]; then
  git clone --single-branch --depth 1 "$GSTACK_REPO" "$CONFIG/skills/gstack"
fi
( cd "$CONFIG/skills/gstack" && ./setup --team -q ) || warn "gstack setup failed; rerun: CLAUDE_CONFIG_DIR=$CONFIG ~/.claude-$NAME/skills/gstack/setup --team"
ok "gstack"

step "Plugins"
node -e '
const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
for (const m of Object.values(s.extraKnownMarketplaces || {}))
  if (m.source && m.source.repo) console.log("market " + m.source.repo);
for (const [p, on] of Object.entries(s.enabledPlugins || {})) if (on) console.log("plugin " + p);
' "$CONFIG/settings.json" | while read -r kind ref; do
  if [ "$kind" = market ]; then
    claude plugin marketplace add "$ref" >/dev/null 2>&1 || true
  else
    claude plugin install "$ref" >/dev/null 2>&1 && ok "$ref" || warn "plugin $ref: install inside claude-$NAME with /plugin"
  fi
done

step "claude-$NAME command"
mkdir -p "$BIN"
cat > "$BIN/claude-$NAME" <<EOF
#!/bin/sh
# claude-$NAME: Claude Code with its own login, history and skills ($CONFIG).
# The plain \`claude\` command keeps using ~/.claude.
export CLAUDE_CONFIG_DIR="$CONFIG"
# A set API key would override the account you sign in with.
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL ANTHROPIC_MODEL
CLAUDE="\$HOME/.local/bin/claude"
[ -x "\$CLAUDE" ] || CLAUDE="\$(command -v claude)" || { echo "claude not found"; exit 1; }
exec "\$CLAUDE" "\$@"
EOF
chmod +x "$BIN/claude-$NAME"
grep -qs '.local/bin' ~/.zshrc || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
ok "$BIN/claude-$NAME"

step "Done"
if [ ${#WARNINGS[@]} -gt 0 ]; then
  echo "Finished with ${#WARNINGS[@]} warning(s):"
  for w in "${WARNINGS[@]}"; do echo "  - $w"; done
fi
echo
echo "Next steps:"
echo "  1. Open a new terminal, run: claude-$NAME   then /login with your own account."
echo "     Your claude.ai connectors (Gmail, Drive, Linear, Slack...) appear once you're signed in."
echo "  2. Check the Mac owner's account is unchanged: claude, then /status."
echo "  3. For Agent Mixer: gh auth login, clone the repo, then in it run:"
echo "     CLAUDE_CONFIG_DIR=$CONFIG ./setup/mac.sh --role engineer"
exit 0
