#!/usr/bin/env bash
# ==============================================================================
# Josefine: Starter Josefine AI-assistenten
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Last inn miljøkonfigurasjon hvis den finnes
CONFIG_ENV="${XDG_CONFIG_HOME:-$HOME/.config}/josefine/env"
if [ -f "$CONFIG_ENV" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$CONFIG_ENV"
    set +a
elif [ -f "$REPO_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$REPO_DIR/.env"
    set +a
fi

if ! command -v quickshell &>/dev/null; then
    echo "❌ quickshell er ikke installert på systemet!"
    exit 1
fi

export JOSEFINE_ROOT="$REPO_DIR"

echo "✨ Starter Josefine Quickshell UI..."
exec quickshell -p "$REPO_DIR/quickshell"
