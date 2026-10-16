#!/usr/bin/env bash
set -euo pipefail

# Finn rotmappen for Josefine-prosjektet
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export JOSEFINE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Last inn miljøkonfigurasjon (f.eks. GEMINI_API_KEY)
CONFIG_ENV="${XDG_CONFIG_HOME:-$HOME/.config}/josefine/env"
if [ -f "$CONFIG_ENV" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$CONFIG_ENV"
    set +a
fi

echo "🌸 Starter Josefine i nested Hyprland på skrivebordet..."
echo "📁 Rotmappe: $JOSEFINE_ROOT"

if [ -z "${WAYLAND_DISPLAY:-}" ]; then
    echo "⚠️  ADVARSEL: Ingen WAYLAND_DISPLAY funnet. Nested test krever en aktiv Wayland-sesjon."
    exit 1
fi

if ! command -v Hyprland &>/dev/null; then
    echo "❌ Hyprland er ikke installert på systemet!"
    exit 1
fi

if ! command -v quickshell &>/dev/null; then
    echo "❌ quickshell er ikke installert på systemet!"
    exit 1
fi

# 1. Fortell vertens Hyprland at testvinduet skal være flytende (floating), sentrert og nøyaktig 1520x720
echo "📐 Setter flytende vindusregel (1520x720) på verten..."
hyprctl eval 'hl.window_rule({ name = "josefine-nested", match = { class = "aquamarine" }, float = true, size = "1520 720", center = true })' >/dev/null 2>&1 || true

# 2. Start Hyprland i bakgrunnen
echo "🚀 Starter nested Hyprland..."
Hyprland -c "$JOSEFINE_ROOT/dev/hyprland-dev.lua" > /tmp/hypr_nested.log 2>&1 &
HYPR_PID=$!

cleanup() {
    echo ""
    echo "🛑 Avslutter Josefine testmiljø..."
    if [ -n "${QS_PID:-}" ] && kill -0 "$QS_PID" 2>/dev/null; then
        kill "$QS_PID" 2>/dev/null || true
    fi
    if [ -n "${HYPR_PID:-}" ] && kill -0 "$HYPR_PID" 2>/dev/null; then
        kill "$HYPR_PID" 2>/dev/null || true
    fi
    sleep 0.2
    if [ -n "${QS_PID:-}" ] && kill -0 "$QS_PID" 2>/dev/null; then
        kill -9 "$QS_PID" 2>/dev/null || true
    fi
    if [ -n "${HYPR_PID:-}" ] && kill -0 "$HYPR_PID" 2>/dev/null; then
        kill -9 "$HYPR_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

# 3. Vent på at den nye instansen registrerer Wayland-socket
echo "⏳ Venter på virtuell Wayland-socket..."
TARGET_SOCKET=""
TARGET_INSTANCE=""

for i in {1..30}; do
    if ! kill -0 "$HYPR_PID" 2>/dev/null; then
        echo "❌ Hyprland stoppet uventet! Sjekk /tmp/hypr_nested.log"
        exit 1
    fi

    INFO=$(hyprctl instances | awk -v pid="$HYPR_PID" '
        $1 == "instance" { inst=$2 }
        $1 == "pid:" && $2 == pid { found=1 }
        $1 == "wl" && $2 == "socket:" && found {
            sub(/:$/, "", inst);
            print inst, $3;
            exit
        }
    ')

    if [ -n "$INFO" ]; then
        TARGET_INSTANCE=$(echo "$INFO" | awk '{print $1}')
        TARGET_SOCKET=$(echo "$INFO" | awk '{print $2}')
        break
    fi
    sleep 0.1
done

if [ -z "$TARGET_SOCKET" ]; then
    echo "❌ Kunne ikke finne Wayland-socket for den nested instansen."
    cat /tmp/hypr_nested.log | tail -n 20
    exit 1
fi

echo "✅ Koblet til virtuell display: $TARGET_SOCKET (instans: $TARGET_INSTANCE)"

# 4. Start Quickshell knyttet til den virtuelle skjermen
echo "✨ Starter Quickshell AI-panel..."
WAYLAND_DISPLAY="$TARGET_SOCKET" HYPRLAND_INSTANCE_SIGNATURE="$TARGET_INSTANCE" \
    quickshell -p "$JOSEFINE_ROOT/quickshell" > /tmp/quickshell_nested.log 2>&1 &
QS_PID=$!

echo ""
echo "=========================================================="
echo "  🌸 JOSEFINE ER NÅ AKTIV PÅ SKRIVEBORDET (1520x720) 🌸"
echo "=========================================================="
echo "  • Høyre side (390px): Josefine Quickshell panel"
echo "  • Venstre side (1130px): App-arbeidsflate"
echo ""
echo "  ⌨️  Snarveier inni testvinduet (bruker ALT for å ikke kollidere med verten):"
echo "     - ALT + Return     : Åpne Ghostty/terminal"
echo "     - ALT + B          : Åpne Chromium"
echo "     - ALT + Q          : Lukk aktivt vindu"
echo "     - ALT + SHIFT + M  : Avslutt test-sesjonen"
echo ""
echo "  💡 Tips: Du kan også åpne apper direkte inni Josefine fra en annen terminal:"
echo "     HYPRLAND_INSTANCE_SIGNATURE=\"$TARGET_INSTANCE\" hyprctl dispatch exec <app>"
echo ""
echo "  Loggfiler:"
echo "     - Hyprland:   /tmp/hypr_nested.log"
echo "     - Quickshell: /tmp/quickshell_nested.log"
echo "=========================================================="
echo "Trykk Ctrl+C her eller bruk SUPER+SHIFT+M inni vinduet for å avslutte."

# Vent på at brukeren lukker Hyprland
wait "$HYPR_PID"
