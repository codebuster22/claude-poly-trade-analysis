#!/usr/bin/env bash
# publish-plugin.sh - mirror packages/trade-analysis to the public plugin repo with a bundled server.
# Usage: PUBLIC_REMOTE=git@github.com:codebuster22/claude-poly-trade-analysis.git bash packages/trade-analysis/scripts/publish-plugin.sh
set -euo pipefail
: "${PUBLIC_REMOTE:?set PUBLIC_REMOTE to the public repo git URL}"
ROOT=$(git rev-parse --show-toplevel)
PREFIX="packages/trade-analysis"
WORK=$(mktemp -d)

# 1) split the package subtree to a SHA (tracked files only; dist/ is gitignored, so absent here)
SPLIT_SHA=$(git -C "$ROOT" subtree split --prefix="$PREFIX")

# 2) extract that tree's FILES into a fresh dir (no git metadata — avoids the worktree/git-init clash)
git -C "$ROOT" archive "$SPLIT_SHA" | tar -x -C "$WORK"

# 3) install deps so the bundler can resolve+inline them, then build the self-contained bundle.
#    IMPORTANT: the extracted tree has NO monorepo root, so the library's own deps
#    (decimal.js/viem/zod, listed in $WORK/package.json) must be installed at $WORK too —
#    not just the SDK in $WORK/mcp. Both node_modules are gitignored (Task 1 Step 4).
( cd "$WORK" && bun install )                        # library deps -> $WORK/node_modules
( cd "$WORK/mcp" && bun install && bun run build )   # SDK + bundle -> $WORK/dist/server.js

# 4) fresh repo, commit (force-add the bundle past the archived .gitignore), force-push to public main
cd "$WORK"
git init -q
git add -A
git add -f dist/server.js          # the mirror MUST ship the bundle, even though .gitignore lists dist/
git -c user.email=publish@local -c user.name=publish commit -qm "release: trade-analysis plugin ($(git -C "$ROOT" rev-parse --short HEAD))"
git branch -M main
git remote add origin "$PUBLIC_REMOTE"
git push -f origin main
echo "published $SPLIT_SHA -> $PUBLIC_REMOTE (main), dist/server.js included"
