#!/usr/bin/env node

import { connect } from "./cdp.js";

const limit = parseInt(process.argv[2] || "30", 10);

try {
  const cdp = await connect(5000);
  const pages = await cdp.getPages();
  const page = pages.at(-1);
  if (!page) {
    console.error("✗ No active tab found");
    process.exit(1);
  }

  const sessionId = await cdp.attachToPage(page.targetId);
  await cdp.navigate(sessionId, "https://news.ycombinator.com");
  await new Promise((r) => setTimeout(r, 1000));

  const submissions = await cdp.evaluate(
    sessionId,
    `(() => {
      const items = [];
      const rows = document.querySelectorAll("tr.athing");
      for (const row of rows) {
        const id = row.getAttribute("id");
        const titleEl = row.querySelector(".titleline > a");
        const title = titleEl?.textContent || "";
        const url = titleEl?.getAttribute("href") || "";
        const siteEl = row.querySelector(".sitestr");
        const site = siteEl?.textContent || "";
        const subtext = row.nextElementSibling;
        const scoreEl = subtext?.querySelector(".score");
        const points = scoreEl ? parseInt(scoreEl.textContent) : 0;
        const userEl = subtext?.querySelector(".hnuser");
        const author = userEl?.textContent || "";
        items.push({ id, title, url, site, points, author });
      }
      return items;
    })()`,
  );

  for (const item of submissions.slice(0, limit)) {
    console.log(`${item.title} (${item.points} pts by ${item.author}) - ${item.url}`);
  }

  cdp.close();
  setTimeout(() => process.exit(0), 50);
} catch (e) {
  console.error("✗", e.message);
  process.exit(1);
}
