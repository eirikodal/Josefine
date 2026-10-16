#!/usr/bin/env node

import { connect } from "./cdp.js";

try {
  const cdp = await connect(5000);
  const pages = await cdp.getPages();
  const page = pages.at(-1);

  if (!page) {
    console.error("✗ No active tab found");
    process.exit(1);
  }

  const sessionId = await cdp.attachToPage(page.targetId);
  const { cookies } = await cdp.send("Network.getCookies", {}, sessionId);

  for (const cookie of cookies) {
    console.log(`${cookie.name}: ${cookie.value}`);
    console.log(`  domain: ${cookie.domain}`);
    console.log(`  path: ${cookie.path}`);
    console.log(`  httpOnly: ${cookie.httpOnly}`);
    console.log(`  secure: ${cookie.secure}`);
    console.log("");
  }

  cdp.close();
} catch (e) {
  console.error("✗", e.message);
  process.exit(1);
} finally {
  setTimeout(() => process.exit(0), 50);
}
