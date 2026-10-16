#!/usr/bin/env bash
set -euo pipefail

NESTED_SIG=$(hyprctl instances 2>/dev/null | awk '
    $1 == "instance" { inst=$2; sub(/:$/, "", inst) }
    $1 == "wl" && $2 == "socket:" && $3 != "wayland-1" { print inst; exit }
' || true)

if [ -n "$NESTED_SIG" ]; then
    hyprctl --instance "$NESTED_SIG" dispatch "hl.dsp.close_window()" >/dev/null 2>&1 || \
        hyprctl --instance "$NESTED_SIG" dispatch killactive >/dev/null 2>&1 || true
else
    hyprctl dispatch "hl.dsp.close_window()" >/dev/null 2>&1 || \
        hyprctl dispatch killactive >/dev/null 2>&1 || true
fi

echo "Lukket aktivt vindu på skjermen."
