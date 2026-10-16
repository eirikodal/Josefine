#!/usr/bin/env bash
set -euo pipefail

if [ $# -eq 0 ]; then
    echo "Bruk: $0 <kommando/app>"
    echo "Eksempel: $0 chromium"
    echo "          $0 foot"
    exit 1
fi

# Finn signaturen til nested Hyprland (den som ikke er wayland-1)
NESTED_SIG=$(hyprctl instances | awk '
    $1 == "instance" { inst=$2; sub(/:$/, "", inst) }
    $1 == "wl" && $2 == "socket:" && $3 != "wayland-1" { print inst; exit }
')

if [ -z "$NESTED_SIG" ]; then
    echo "❌ Fant ingen kjørende Josefine nested-sesjon."
    echo "Start den først med: ./scripts/run-dev.sh"
    exit 1
fi

CMD="$*"
# Hvis brukeren ber om chromium, åpne i isolert profil og ren web-app-modus (--app)
if [[ "$CMD" =~ ^chromium ]]; then
    if [[ ! "$CMD" =~ --user-data-dir ]]; then
        CMD="$CMD --user-data-dir=${HOME}/.cache/browser-tools --remote-debugging-port=9222 --no-first-run --no-default-browser-check --disable-infobars"
    fi
    if [[ ! "$CMD" =~ --app= ]]; then
        CMD="$CMD --app=about:blank"
    fi
fi

echo "🚀 Åpner '$CMD' inni Josefine ($NESTED_SIG)..."
hyprctl --instance "$NESTED_SIG" dispatch "hl.dsp.exec_cmd('$CMD')"
