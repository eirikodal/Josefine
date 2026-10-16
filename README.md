# ✨ Josefine

Et vennlig, stemmestyrt **Quickshell-panel** som kombinerer sanntids-stemmesamtale med en autonom jobb-agent i bakgrunnen.

## Konsept

* **Vennlig Quickshell-panel i front (Josefine):** Et fast dokket panel med levende pastell-aura, musikkspiller og enkel trykk-for-å-snakke-knapp. Josefine snakker naturlig i sanntid via Gemini Live og holder samtalen gående helt håndfritt.
* **Jobb-agent i bakgrunnen:** Når det trengs å utføre faktiske oppgaver – som å åpne nettsider eller apper på skjermen, søke opp svar, spille musikk eller lage interaktive verktøy – delegerer Josefine oppdraget til en autonom Pi SDK-arbeidsagent i bakgrunnen og sier ifra når oppgaven er løst.
* **Eget arbeidsområde (`~/JosefineHome`):** Brukerprofil, egne notater (`Wiki/`) og ferdigheter (`Skills/`) lagres separat fra kildekoden i `~/JosefineHome`.

## Kom i gang

```bash
# Installer og sett opp tjeneste
./install.sh

# Eller kjør direkte i utviklingsmodus på skrivebordet
./scripts/run-dev.sh
```

Konfigurasjon og API-nøkler legges i `~/.config/josefine/env` (se [`.env.example`](.env.example)).
