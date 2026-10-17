#!/usr/bin/env bash
# ==============================================================================
# Josefine: Åpner en URL eller lokal HTML-fil på venstre skjermflate i Hyprland.
# Bruker alltid Chromium i ren web-app-modus (--app=<url>) uten meny/adressefelt
# og lukker automatisk eventuelle cookie-bannere!
# ==============================================================================
set -euo pipefail

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
    echo "Bruk: $0 <url-eller-filsti>" >&2
    exit 1
fi

# Konverter lokal filsti til file:// URL hvis det ikke alt er en URL
if [[ ! "$TARGET" =~ ^https?:// ]] && [[ ! "$TARGET" =~ ^file:// ]]; then
    ABS_PATH="$(realpath "$TARGET" 2>/dev/null || echo "$TARGET")"
    TARGET="file://${ABS_PATH}"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

node "${REPO_DIR}/Skills/browser-tools/browser-nav.js" "$TARGET"

if [[ "$TARGET" =~ ^https?:// ]]; then
    node "${REPO_DIR}/Skills/browser-tools/browser-dismiss-cookies.js" >/dev/null 2>&1 || true
fi
