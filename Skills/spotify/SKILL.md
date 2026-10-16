---
name: spotify
description: Spiller musikk via Spotify i bakgrunnen (spotifyd + MPRIS-minispiller øverst i Josefine-panelet).
---

# Spotify musikkavspilling (spotify)

Når barnet vil høre på en sang, artist, album eller spilleliste (f.eks. Kaptein Sabeltann, Frost, Fantorangen, BlimE):

Josefine har en innebygd minispiller øverst i sitt eget panel som styres via `spotifyd` og MPRIS. **Ikke** åpne et nettleservindu for å spille musikk!

Bruk `spotify.js` i denne skill-mappen:
```bash
# Søk og spill en sang direkte på Josefine (spotifyd):
./Skills/spotify/spotify.js play "Kaptein Sabeltann Hiv ohoi"

# Eller spill et helt album / spilleliste:
./Skills/spotify/spotify.js play "Frost Norsk" --type album
./Skills/spotify/spotify.js play "Barnemusikk" --type playlist

# Pause, neste sang, forrige sang eller sjekk hva som spilles:
./Skills/spotify/spotify.js pause
./Skills/spotify/spotify.js next
./Skills/spotify/spotify.js prev
./Skills/spotify/spotify.js status
```
