#!/usr/bin/env bash
# Developed by @jams2blues – ZeroContract Studio
# File:    scripts/codex-setup.sh
# Rev :    r3   2025-09-05
# Summary: deterministic Yarn 4 bootstrap for OpenAI Codex CI

set -euo pipefail

echo "⏳  ZeroUnbound Codex bootstrap …"

# 0 · always execute from repo root even when invoked via relative path
ROOT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$ROOT_DIR"

# 1 · activate pinned Yarn version (Invariant I21)
corepack enable
corepack prepare yarn@4.9.1 --activate

# 2 · install dependencies from lockfile (creates .yarn/install-state.gz)
echo "📦  Installing dependencies (immutable)…"
yarn install --immutable --inline-builds

# 3 · surface runtime versions for easier CI debugging
echo "🐣 Node: $(node --version)"
echo "🧶 Yarn: $(yarn --version)"

echo "✅ Workspace ready — run: yarn lint && yarn build && yarn test"

# What changed & why:
# • Removed C-style comment header that broke /bin/bash parsing in Codex.
# • yarn install now succeeds after Corepack activation.
