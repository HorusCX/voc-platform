#!/usr/bin/env bash
# Install git hooks by symlinking from scripts/hooks/ to .git/hooks/
# Run once after cloning: bash scripts/install-hooks.sh

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
HOOKS_SRC="$ROOT/scripts/hooks"
HOOKS_DST="$ROOT/.git/hooks"

for hook in "$HOOKS_SRC"/*; do
    name="$(basename "$hook")"
    target="$HOOKS_DST/$name"

    if [[ -L "$target" ]]; then
        echo "Updating symlink: .git/hooks/$name"
    elif [[ -f "$target" ]]; then
        echo "Backing up existing hook: .git/hooks/$name → $name.bak"
        mv "$target" "$target.bak"
    fi

    ln -sf "../../scripts/hooks/$name" "$target"
    chmod +x "$hook"
    echo "✓ Installed: .git/hooks/$name"
done

echo ""
echo "Git hooks installed. Pre-push checks are now active."
echo "Bypass with: git push --no-verify"
