#!/usr/bin/env bash
# ==============================================================================
# Josefine: Installasjon og oppdatering av kodebase & GUI
# Kjøres ved førstegangsinstallasjon eller via --update (f.eks. nattlig oppdatering).
# Rører aldri brukerens personlige arbeidsmappe i ~/JosefineHome (JOSEFINE.md / Wiki/).
# ==============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IS_UPDATE=false

for arg in "$@"; do
    case "$arg" in
        --update) IS_UPDATE=true ;;
    esac
done

if [ "$IS_UPDATE" = false ]; then
    echo "🌸 Installerer Josefine..."
else
    echo "🌸 Oppdaterer Josefine GUI og kodebase..."
fi

# 1. Gjør alle skript kjørbare
chmod +x "$REPO_DIR"/scripts/*.sh 2>/dev/null || true
chmod +x "$REPO_DIR"/install.sh 2>/dev/null || true

# 2. Sørg for at konfigurasjonsmappe finnes
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/josefine"
mkdir -p "$CONFIG_DIR"

if [ ! -f "$CONFIG_DIR/env" ]; then
    if [ -f "$REPO_DIR/.env.example" ]; then
        cp "$REPO_DIR/.env.example" "$CONFIG_DIR/env"
        echo "📝 Opprettet miljøkonfigurasjon: $CONFIG_DIR/env"
        echo "   (Husk å legge inn din GEMINI_API_KEY der)"
    fi
fi

# 3. Knytt quickshell-katalogen hvis ønskelig/ledig
QUICKSHELL_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/quickshell"
if [ ! -e "$QUICKSHELL_DIR" ]; then
    mkdir -p "$(dirname "$QUICKSHELL_DIR")"
    ln -s "$REPO_DIR/quickshell" "$QUICKSHELL_DIR"
    echo "🔗 Opprettet symlink: $QUICKSHELL_DIR -> $REPO_DIR/quickshell"
elif [ -L "$QUICKSHELL_DIR" ] && [ "$(readlink -f "$QUICKSHELL_DIR")" = "$(readlink -f "$REPO_DIR/quickshell")" ]; then
    echo "✅ Quickshell-konfigurasjon er allerede riktig lenket."
else
    echo "ℹ️ Eksisterende $QUICKSHELL_DIR beholdes. launch.sh bruker direkte sti uansett."
fi

# 4. Sjekk Node.js runtime og installer npm-pakker (Pi SDK, browser-tools og brave-search)
if command -v node &>/dev/null; then
    echo "✅ Node.js er installert ($(node -v))."
    if command -v npm &>/dev/null; then
        echo "📦 Installerer npm-avhengigheter (Pi SDK, browser-tools og brave-search)..."
        (cd "$REPO_DIR" && npm install --no-audit --no-fund)
    fi
    # Synkroniser ~/JosefineHome (oppretter Wiki/ og kopierer inn manglende standard-skills uten å røre JOSEFINE.md eller eksisterende Wiki)
    node -e "import('$REPO_DIR/backend/homeManager.js').then(m => m.ensureJosefineHome('$REPO_DIR'))"
else
    echo "⚠️ Node.js mangler. Installer med: pacman -S nodejs npm"
fi

# 5. Konfigurer spotifyd (Spotify Connect + MPRIS for minispilleren i Josefine-panelet)
mkdir -p "$HOME/.config/spotifyd"
if [ ! -f "$HOME/.config/spotifyd/spotifyd.conf" ] && [ -f "$REPO_DIR/configs/spotifyd.conf" ]; then
    cp "$REPO_DIR/configs/spotifyd.conf" "$HOME/.config/spotifyd/spotifyd.conf"
    echo "🎵 Opprettet ~/.config/spotifyd/spotifyd.conf (enhet: Josefine)"
fi

# 6. Symlenk browser-tools og brave-search til ~/.agents/skills/ dersom de ikke finnes der
mkdir -p "$HOME/.agents/skills"
for skill in browser-tools brave-search; do
    if [ ! -e "$HOME/.agents/skills/$skill" ] && [ -d "$REPO_DIR/Skills/$skill" ]; then
        ln -s "$REPO_DIR/Skills/$skill" "$HOME/.agents/skills/$skill"
        echo "🔗 Symlenket $skill til ~/.agents/skills/$skill"
    fi
done

echo "✨ Josefine er klar til bruk!"
echo "   Kjør './scripts/launch.sh' for å starte assistenten."
