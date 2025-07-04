#!/usr/bin/env bash
/*───────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    scripts/codex-setup.sh
  Rev :    r4   2025-09-05
  Summary: Codex CI bootstrap – self-healing Yarn pin
────────────────────────────────────────────────────────────────*/
set -euo pipefail

echo "⏳  ZeroUnbound Codex bootstrap …"

# 0 · always execute from repo root even when invoked via relative path
ROOT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$ROOT_DIR"

# 1 · activate pinned Yarn version (Invariant I21)
corepack enable
corepack prepare yarn@4.9.1 --activate

# 2 · ensure a project-local Yarn release file when .yarnrc.yml lists none
#     (keeps dev parity without breaking Codex CI)
if [ ! -f ".yarn/releases/yarn-4.9.1.cjs" ]; then
  mkdir -p .yarn/releases
  echo "📎  Writing Yarn 4.9.1 release file (project-local)…"
  yarn set version 4.9.1 --skip-plugins >/dev/null
fi

# 3 · install dependencies from lockfile (creates .yarn/install-state.gz)
echo "📦  Installing dependencies (immutable)…"
yarn install --immutable

# 4 · surface runtime versions for easier CI debugging
echo "🐣  Node: $(node --version)"
echo "🧶  Yarn: $(yarn --version)"

echo "✅  Workspace ready — run:  yarn lint && yarn build && yarn test"

#───────────────────────────────────────────────────────────────
# What changed & why:
# • Removed yarnPath from .yarnrc.yml; Corepack now handles the pin.
# • r4 script auto-generates yarn-4.9.1.cjs only when absent, fixing
#   ENOENT in Codex while keeping local Windows dev in sync.
#───────────────────────────────────────────────────────────────
