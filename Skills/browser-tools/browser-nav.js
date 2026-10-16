#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "./cdp.js";

const url = process.argv[2];

if (!url) {
  console.log("Usage: browser-nav.js <url>");
  process.exit(1);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const startScript = join(scriptDir, "browser-start.js");
const dismissScript = join(scriptDir, "browser-dismiss-cookies.js");

let cdp;
try {
  cdp = await connect(2000);
} catch {
  // Chromium kjører ikke ennå – start i --app=<url> web-app-modus!
  execFileSync(process.execPath, [startScript, url], { stdio: "inherit" });
  spawn(process.execPath, [dismissScript], { detached: true, stdio: "ignore" }).unref();
  process.exit(0);
}

try {
  const pages = await cdp.getPages();
  const page = pages.at(-1);
  if (!page) {
    cdp.close();
    execFileSync(process.execPath, [startScript, url], { stdio: "inherit" });
    process.exit(0);
  }

  const sessionId = await cdp.attachToPage(page.targetId);
  await cdp.navigate(sessionId, url);
  console.log("✓ Navigated app window to:", url);
  cdp.close();

  // Fjern eventuelle cookie-bannere i bakgrunnen etter navigering
  setTimeout(() => {
    spawn(process.execPath, [dismissScript], { detached: true, stdio: "ignore" }).unref();
    process.exit(0);
  }, 150);
} catch (e) {
  console.error("✗", e.message);
  process.exit(1);
}
