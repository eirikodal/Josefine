---
name: vis-bilde
description: Søker opp og viser barnevennlige bilder, dyr, dinosaurer, verdensrommet eller illustrasjoner på venstresiden av skjermen.
---

# Vis bilde (vis-bilde)

Brukes når barnet vil se bilder av noe (f.eks. dyr, dinosaurer, prinsesser, planeter, biler eller tegninger) på venstresiden av skjermen (1130×720).

## Fremgangsmåte
1. Kjør `./scripts/open-window.sh` direkte med Google Bildesøk og SafeSearch påslått (`safe=active`). Skriptet åpner Chromium i ren web-app-modus og lukker eventuelle cookie-bannere automatisk:
   ```bash
   ./scripts/open-window.sh "https://www.google.com/search?tbm=isch&safe=active&q=<søkeord>"
   ```
2. Alternativt, hvis barnet ber om et helt spesifikt bildekort med stor tittel og morsomme fakta (f.eks. «Lag et kort om Tyrannosaurus Rex»), bruk `magisk-tavle`-ferdigheten til å generere en vakker HTML-side og åpne den med `./scripts/open-window.sh "file:///tmp/josefine-tavle.html"`.
