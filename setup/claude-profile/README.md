# Your Claude profile on someone else's Mac

Adds a second command, like `claude-sid`, on a Mac that already has its owner's `claude`.
It has its own login, history, settings, skills and Keychain entry (`~/.claude-sid`).
The owner's `claude` (`~/.claude`) is not touched.

## 1. Pack (on your own computer)
In Git Bash (Windows) or Terminal (Mac), from this repo:

    bash setup/claude-profile/pack.sh

It writes `~/Downloads/claude-profile-kit.tar.gz` (a few MB): your `CLAUDE.md`, `profile/`,
agents, skills, plugin list and safe settings. It leaves out your login, history, memory,
hooks and env, and stops if a file looks like it holds a key.

## 2. Copy the kit to the Mac
Google Drive, email to yourself, or a USB stick. The file is personal; don't commit it.

## 3. Install (on the Mac)

    cd ~/Downloads
    tar -xzf claude-profile-kit.tar.gz
    bash claude-profile-kit/install.sh --name sid

It installs what's missing (Homebrew, git, Node, Bun, Claude Code), copies the profile to
`~/.claude-sid`, installs gstack and your plugins into it, and creates `~/.local/bin/claude-sid`.
Safe to re-run; re-pack and re-run to update skills.

## 4. Sign in
Open a new terminal, run `claude-sid`, then `/login` with your account.
Your claude.ai connectors (Gmail, Drive, Linear, Slack...) come with the account.
Check the owner's `claude` still shows their account with `/status`.

## Agent Mixer on that Mac
Run the repo setup into your profile, so it doesn't touch the owner's `~/.claude`:

    CLAUDE_CONFIG_DIR=~/.claude-sid ./setup/mac.sh --role engineer
    CLAUDE_CONFIG_DIR=~/.claude-sid ./setup/verify.sh
