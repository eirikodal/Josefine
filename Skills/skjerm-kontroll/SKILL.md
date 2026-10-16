---
name: skjerm-kontroll
description: Styrer lydvolum (skru opp/ned lyden), skjermhvile (god natt / skjerm av og på) og lukker eller bytter vinduer på venstresiden av skjermen.
---

# Skjerm- og lydkontroll

Bruk denne ferdigheten når barnet ber om å:
1. **Skru opp eller ned lyden** (*«Josefine, skru opp lyden!»*, *«Det er for høyt, skru ned litt»*).
2. **Slå av skjermen for kvelden** (*«God natt, Josefine»*, *«Skru av skjermen»*).
3. **Rydde bort eller bytte vindu** på venstresiden av skjermen.

## 1. Lydvolum (PipeWire `wpctl`)
```bash
# Skru opp lyden (standard +12%):
./scripts/audio-screen.sh volume up

# Skru ned lyden (standard -12%):
./scripts/audio-screen.sh volume down

# Sett et bestemt volum (0 til 100%):
./scripts/audio-screen.sh volume set 65

# Sjekk nåværende volum:
./scripts/audio-screen.sh volume status
```

## 2. Skjermhvile / «God natt» (Hyprland DPMS)
Skjermen slår seg automatisk av om natten mellom kl. **20:00 og 06:30**, men kan også slås av eller på når som helst:
```bash
# Sett skjermen i hvilemodus (stopper også eventuell musikk):
./scripts/audio-screen.sh screen off

# Vekk skjermen igjen:
./scripts/audio-screen.sh screen on
```

## 3. Vinduer og apper på venstresiden
```bash
# Lukk aktivt vindu på venstresiden:
./scripts/close-window.sh

# Åpne NRK Super i ren web-app-modus:
./scripts/open-window.sh "https://nrksuper.no"
```
