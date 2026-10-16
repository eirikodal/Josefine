#!/usr/bin/env node

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { connect } from "./cdp.js";

const url = process.argv[2];

function htmlToMarkdown(html) {
  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  turndown.use(gfm);
  turndown.addRule("removeEmptyLinks", {
    filter: (node) => node.nodeName === "A" && !node.textContent?.trim(),
    replacement: () => "",
  });
  return turndown
    .turndown(html)
    .replace(/\[\\?\[\s*\\?\]\([^)]*\)\]\([^)]*\)/g, "")
    .replace(/ +/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const globalTimeout = setTimeout(() => {
  console.error("✗ Global timeout exceeded (30s)");
  process.exit(1);
}, 30000);

try {
  const cdp = await connect(5000);
  const pages = await cdp.getPages();
  const page = pages.at(-1);

  if (!page) {
    console.error("✗ No active tab found");
    process.exit(1);
  }

  const sessionId = await cdp.attachToPage(page.targetId);

  if (url) {
    await cdp.navigate(sessionId, url);
    await new Promise((r) => setTimeout(r, 1200));
  }

  const html = await cdp.evaluate(sessionId, "document.documentElement.outerHTML");
  const finalUrl = await cdp.evaluate(sessionId, "window.location.href");

  const doc = new JSDOM(html, { url: finalUrl });
  const reader = new Readability(doc.window.document);
  const article = reader.parse();

  let content;
  if (article && article.content) {
    content = htmlToMarkdown(article.content);
  } else {
    const fallbackDoc = new JSDOM(html, { url: finalUrl });
    const body = fallbackDoc.window.document;
    body
      .querySelectorAll("script, style, noscript, nav, header, footer, aside")
      .forEach((el) => el.remove());
    const main =
      body.querySelector("main, article, [role='main'], .content, #content") || body.body;
    const mainHtml = main?.innerHTML || "";
    content = mainHtml.trim().length > 100 ? htmlToMarkdown(mainHtml) : "(Could not extract content)";
  }

  console.log(`URL: ${finalUrl}`);
  if (article?.title) console.log(`Title: ${article.title}`);
  console.log("");
  console.log(content);

  cdp.close();
} catch (e) {
  console.error("✗", e.message);
  process.exit(1);
} finally {
  clearTimeout(globalTimeout);
  setTimeout(() => process.exit(0), 50);
}
