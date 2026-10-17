// @ts-check
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { computeChildInfo, getJosefineHomeDir, loadChildProfile } from "./homeManager.js";

/**
 * @fileoverview Bygger Josefines dynamiske systemprompt for Gemini Live
 * fra ~/JosefineHome/JOSEFINE.md, profile.json (med automatisk aldersberegning fra fødselsår),
 * Wiki/ og oversikten over Arbeidsmaurens ferdigheter i Skills/.
 */

/**
 * @typedef {Object} SkillMetadata
 * @property {string} name
 * @property {string} description
 * @property {string} location
 */

/**
 * Parser enkel YAML-frontmatter fra en SKILL.md-fil.
 * @param {string} content
 * @returns {{ name?: string, description?: string }}
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const block = match[1];
  /** @type {{ name?: string, description?: string }} */
  const result = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim().replace(/^["']|["']$/g, "");
    if (key === "name") result.name = val;
    if (key === "description") result.description = val;
  }
  return result;
}

/**
 * Skanner Skills/<navn>/SKILL.md i gitt mappe.
 * @param {string} baseDir
 * @returns {Promise<SkillMetadata[]>}
 */
export async function discoverJosefineSkills(baseDir) {
  const skillsDir = path.join(baseDir, "Skills");
  /** @type {SkillMetadata[]} */
  const skills = [];

  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(skillsDir, entry.name, "SKILL.md");
      try {
        const raw = await readFile(skillFile, "utf8");
        const fm = parseFrontmatter(raw);
        skills.push({
          name: fm.name || entry.name,
          description: fm.description || `Ferdighet i Skills/${entry.name}`,
          location: skillFile,
        });
      } catch {
        // Ignorer mapper uten SKILL.md
      }
    }
  } catch {
    // Ingen Skills/-mappe ennå
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name, "nb"));
}

/**
 * Leser JOSEFINE.md (eller AGENTS.md), profile.json, Wiki/ og skanner Skills/<navn>/SKILL.md
 * fra homeDir (~/JosefineHome) for å bygge Josefines systemprompt til Gemini Live.
 *
 * @param {string} [homeDir] - Sti til JosefineHome (eller test-mappe)
 * @param {Date} [now] - Valgfri dato for aldersberegning
 * @returns {Promise<string>}
 */
export async function buildJosefineSystemPrompt(homeDir = getJosefineHomeDir(), now = new Date()) {
  const parts = [];
  const profile = loadChildProfile(homeDir);
  const childInfo = computeChildInfo(profile, now);
  const childName = childInfo?.name || "barnet";

  // 1. Les JOSEFINE.md (eller fallback til AGENTS.md)
  let basePrompt = "";
  for (const filename of ["JOSEFINE.md", "AGENTS.md"]) {
    try {
      const content = await readFile(path.join(homeDir, filename), "utf8");
      if (content.trim()) {
        basePrompt = content.trim();
        break;
      }
    } catch {
      // Prøv neste
    }
  }

  if (!basePrompt) {
    basePrompt =
      `Du er Josefine, ${childName} sin snille, lekne og magiske bestevenn og assistent på norsk. ` +
      "Snakk alltid vennlig, varmt og barnevennlig med korte, engasjerende setninger. " +
      "Når barnet vil se bilder, høre musikk eller få laget noe på skjermen, delegerer du oppgaven til Arbeidsmauren med verktøyet delegate_task.";
  }
  parts.push(basePrompt);

  // 2. Dynamisk aldersinformasjon utregnet fra fødselsår og inneværende år
  if (childInfo) {
    parts.push(
      [
        "## Barnets nåværende alder",
        `- **Navn:** ${childInfo.name}`,
        `- **Fødselsår:** ${childInfo.birthYear} (ca. ${childInfo.age} år i ${now.getFullYear()})`,
      ].join("\n"),
    );
  }

  // 3. Inkluder korte kunnskapsnotater fra Wiki/
  const wikiDir = path.join(homeDir, "Wiki");
  /** @type {string[]} */
  const wikiNotes = [];

  /**
   * @param {string} dir
   */
  async function scanWiki(dir) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await scanWiki(full);
        } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") {
          try {
            const raw = await readFile(full, "utf8");
            const body = raw.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "").trim();
            if (body) {
              wikiNotes.push(body);
            }
          } catch {
            // Ignorer uleselige filer
          }
        }
      }
    } catch {
      // Ingen Wiki/-mappe ennå
    }
  }

  await scanWiki(wikiDir);
  if (wikiNotes.length > 0) {
    parts.push("## Kunnskapsbase (Wiki)\n" + wikiNotes.join("\n\n"));
  }

  // 4. Oversikt over Arbeidsmaurens spesialferdigheter (Skills/)
  const skills = await discoverJosefineSkills(homeDir);
  if (skills.length > 0) {
    const skillLines = skills.map((s) => `- **${s.name}**: ${s.description}`).join("\n");
    parts.push(
      [
        "## Arbeidsmaurens spesialferdigheter (Skills)",
        `Når ${childName} ber om noe som matcher disse ferdighetene, delegerer du oppgaven til Arbeidsmauren med \`delegate_task\`:`,
        "",
        skillLines,
      ].join("\n"),
    );
  }

  // 5. Faste regler for samtaleavslutning og samspill med Arbeidsmauren
  parts.push(
    [
      "## Samtale- og verktøyregler",
      "- **Avslutte samtalen (`end_conversation`):** Når barnet eller en voksen sier «Ha det», «Takk, det var alt», «Vi har ikke noe mer nå», «Snakkes senere» eller tydelig er ferdig med å prate, skal du si en kort, koselig avskjed og kalle `end_conversation` slik at mikrofonen skrus av.",
      "- **Flere oppgaver og innspill mens Arbeidsmauren jobber:**",
      "  - Hvis barnet vil endre eller legge til noe på oppgaven Arbeidsmauren *allerede* holder på med (f.eks. «Ta med en mops også!» eller «Gjør fargene rosa!»), kall `steer_task` for å sende ønsket direkte til den pågående oppgaven.",
      "  - Hvis barnet ber om en *ny, uavhengig* oppgave mens Arbeidsmauren jobber (f.eks. sette på musikk mens en nettside lages), kall `delegate_task` – Arbeidsmauren kan kjøre flere oppgaver i bakgrunnen samtidig!",
    ].join("\n"),
  );

  return parts.join("\n\n");
}
