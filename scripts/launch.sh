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

# Sørg for at PipeWire, PulseAudio-socket og WirePlumber kjører via systemd --user
if command -v systemctl &>/dev/null; then
    systemctl --user reset-failed pipewire.socket pipewire.service pipewire-pulse.socket pipewire-pulse.service wireplumber.service 2>/dev/null || true
    systemctl --user start pipewire.socket pipewire-pulse.socket wireplumber.service 2>/dev/null || true
fi

# På Raspberry Pi 5 starter HDMI-lydkortene (vc4-hdmi-0 / vc4-hdmi-1) ofte med profil 'off'.
# Vent på WirePlumber og aktiver dem automatisk hvis vi kun har auto_null (Dummy Output) som sink.
if command -v pactl &>/dev/null; then
    (
        for _ in 1 2 3 4 5; do
            if pactl list short cards 2>/dev/null | grep -q "hdmi"; then
                if ! pactl list short sinks 2>/dev/null | grep -vq "auto_null"; then
                    pactl set-card-profile alsa_card.platform-107c701400.hdmi pro-audio 2>/dev/null || true
                    pactl set-card-profile alsa_card.platform-107c706400.hdmi pro-audio 2>/dev/null || true
                fi
                break
            fi
            sleep 1
        done
    ) &
fi

export JOSEFINE_ROOT="$REPO_DIR"

echo "✨ Starter Josefine Quickshell UI..."
exec quickshell -p "$REPO_DIR/quickshell"
