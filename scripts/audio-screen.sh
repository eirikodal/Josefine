#!/usr/bin/env bash
# ==============================================================================
# Josefine: Volum- og skjermstyring (PipeWire wpctl + Hyprland DPMS)
# ==============================================================================
set -euo pipefail

CMD="${1:-help}"
ARG="${2:-}"

case "$CMD" in
  volume)
    SUB="${ARG:-status}"
    VAL="${3:-12}"
    case "$SUB" in
      up)
        wpctl set-volume -l 1.0 @DEFAULT_AUDIO_SINK@ "${VAL}%+"
        wpctl get-volume @DEFAULT_AUDIO_SINK@
        ;;
      down)
        wpctl set-volume @DEFAULT_AUDIO_SINK@ "${VAL}%-"
        wpctl get-volume @DEFAULT_AUDIO_SINK@
        ;;
      set)
        if [ -z "${3:-}" ]; then
          echo "Bruk: audio-screen.sh volume set <0-100>"
          exit 1
        fi
        wpctl set-volume -l 1.0 @DEFAULT_AUDIO_SINK@ "${VAL}%"
        wpctl get-volume @DEFAULT_AUDIO_SINK@
        ;;
      mute)
        wpctl set-mute @DEFAULT_AUDIO_SINK@ 1
        echo "Lyd dempet (mute)"
        ;;
      unmute)
        wpctl set-mute @DEFAULT_AUDIO_SINK@ 0
        wpctl get-volume @DEFAULT_AUDIO_SINK@
        ;;
      status|*)
        wpctl get-volume @DEFAULT_AUDIO_SINK@
        ;;
    esac
    ;;

  screen)
    SUB="${ARG:-on}"
    case "$SUB" in
      off|sleep)
        # Pause eventuell musikk før skjermen går i dvale
        playerctl pause 2>/dev/null || true
        hyprctl dispatch 'hl.dsp.dpms("off")' >/dev/null 2>&1 || hyprctl dispatch dpms off >/dev/null 2>&1 || true
        echo "🌙 Skjermen er satt i hvilemodus (DPMS off)."
        ;;
      on|wake)
        hyprctl dispatch 'hl.dsp.dpms("on")' >/dev/null 2>&1 || hyprctl dispatch dpms on >/dev/null 2>&1 || true
        echo "☀️ Skjermen er skrudd på (DPMS on)."
        ;;
      *)
        echo "Bruk: audio-screen.sh screen <on|off>"
        exit 1
        ;;
    esac
    ;;

  *)
    echo "Bruk:"
    echo "  audio-screen.sh volume <up|down|set|status> [prosent]"
    echo "  audio-screen.sh screen <on|off>"
    ;;
esac
