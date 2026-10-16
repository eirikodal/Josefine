#!/usr/bin/env node

import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { connect } from "./cdp.js";

const globalTimeout = setTimeout(() => {
  console.error("✗ Global timeout exceeded (15s)");
  process.exit(1);
}, 15000);

try {
  const cdp = await connect(5000);
  const pages = await cdp.getPages();
  const page = pages.at(-1);

  if (!page) {
    console.error("✗ No active tab found");
    process.exit(1);
  }

  const sessionId = await cdp.attachToPage(page.targetId);
  const data = await cdp.screenshot(sessionId);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filepath = join(tmpdir(), `screenshot-${timestamp}.png`);

  writeFileSync(filepath, data);
  console.log(filepath);

  cdp.close();
} catch (e) {
  console.error("✗", e.message);
  process.exit(1);
} finally {
  clearTimeout(globalTimeout);
  setTimeout(() => process.exit(0), 50);
}
