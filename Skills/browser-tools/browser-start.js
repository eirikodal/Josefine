#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import { connect } from "./cdp.js";

const args = process.argv.slice(2).filter((a) => a !== "--profile");
const initialUrl = args[0] || "https://www.google.com";
const userDataDir = `${process.env.HOME}/.cache/josefine-browser`;

execSync(`mkdir -p "${userDataDir}"`, { stdio: "ignore" });

// Hvis Chromium allerede kjører på :9222, naviger det eksisterende app-vinduet
try {
  const cdp = await connect(1500);
  const pages = await cdp.getPages();
  const page = pages.at(-1);
  if (page) {
    if (args[0]) {
      const sessionId = await cdp.attachToPage(page.targetId);
      await cdp.navigate(sessionId, initialUrl);
    }
    cdp.close();
    console.log(`✓ App-vindu allerede åpent på :9222 (${initialUrl})`);
    process.exit(0);
  }
  cdp.close();
} catch {}

let chromeBin = "/usr/bin/chromium";
try {
  execSync("test -x /usr/bin/chromium", { stdio: "ignore" });
} catch {
  chromeBin = "chromium";
}

// Start ALLTID i ren Web-App-modus (--app=<url>) uten nettleser-menyer, faner eller adresselinje!
spawn(
  chromeBin,
  [
    "--remote-debugging-port=9222",
    `--user-data-dir=${userDataDir}`,
    "--ozone-platform-hint=auto",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-infobars",
    "--disable-features=Translate",
    `--app=${initialUrl}`,
  ],
  { detached: true, stdio: "ignore" },
).unref();

let connected = false;
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch("http://127.0.0.1:9222/json/version", {
      signal: AbortSignal.timeout(1000),
    });
    if (res.ok) {
      connected = true;
      break;
    }
  } catch {
    await new Promise((r) => setTimeout(r, 400));
  }
}

if (!connected) {
  console.error("✗ Klarte ikke starte Chromium på :9222");
  process.exit(1);
}

console.log(`✓ Chromium startet i web-app-modus (--app=${initialUrl}) på :9222`);
