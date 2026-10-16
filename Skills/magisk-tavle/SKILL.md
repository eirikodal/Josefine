---
name: magisk-tavle
description: Lager interaktive, fargerike HTML-tavler, eventyrkort, telle-leker, bokstavspill, tegnebrett eller faktakort spesialtilpasset barn og viser dem på skjermen.
---

# Magisk Tavle (magisk-tavle)

Brukes når barnet vil:
- Leke med bokstaver, ord eller tall på berøringsskjermen
- Tegne med fingeren på skjermen
- Se et eventyrkort, en stjernehimmel, en regnbue, et faktakort eller et lite touch-spill

## Fremgangsmåte
1. Skriv en selvstendig, vakker og berøringsvennlig HTML-fil til `/tmp/josefine-tavle.html` med `write`-verktøyet.
   - Design for en skjermflate på **1130×720 piksler**.
   - Bruk store, tydelige knapper, glade farger, emojis/SVG-illustrasjoner og barnevennlig norsk tekst.
   - Ingen eksterne avhengigheter som krever innlogging.
2. Åpne tavlen på skjermen til venstre med:
   ```bash
   ./scripts/open-window.sh "file:///tmp/josefine-tavle.html"
   ```
