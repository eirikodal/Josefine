---
name: browser-tools
description: Styrer Chromium i ren web-app-modus (--app=<url>, uten nettleser-menyer eller adresselinje) via rå Chrome DevTools Protocol (CDP, uten Puppeteer/Playwright). Støtter navigering, JavaScript-evaluering, automatisk fjerning av cookie-bannere, skjermbilder og uthenting av lesbar tekst.
---

# Browser Tools (Ren CDP i Web-App-modus for Josefine)

Styrer `/usr/bin/chromium` på venstresiden av skjermen via rå Chrome DevTools Protocol (`cdp.js`) over Node.js sin innebygde `WebSocket` (null Puppeteer/Playwright).
Alle vinduer åpnes **alltid** i ren web-app-modus (`--app=<url>`) uten faner, adresselinje eller nettleser-menyer.

## Starte eller åpne en web-app på skjermen

```bash
./Skills/browser-tools/browser-start.js https://nrksuper.no
```

## Navigere det åpne app-vinduet til en ny adresse (fjerner også cookie-bannere automatisk)

```bash
./Skills/browser-tools/browser-nav.js https://example.com
```

## Fjerne cookie-bannere (Google, YouTube, OneTrust, Cookiebot, norske nettsider osv.)

```bash
./Skills/browser-tools/browser-dismiss-cookies.js
```

## Kjøre JavaScript i det aktive vinduet

```bash
./Skills/browser-tools/browser-eval.js 'document.title'
```

## Ta skjermbilde av nettleservinduet

```bash
./Skills/browser-tools/browser-screenshot.js
```

## Hente ut lesbar tekst (Markdown) fra en side

```bash
./Skills/browser-tools/browser-content.js https://example.com
```
