// @ts-check
import * as fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * @fileoverview Håndterer Josefines arbeidsmappe (~/JosefineHome), brukerprofil (navn + fødselsår fra oppgitt alder),
 * automatisk aldersberegning, JOSEFINE.md og synkronisering av Skills/ og Wiki/.
 */

/**
 * @typedef {Object} ChildProfile
 * @property {string} name - Barnets fornavn
 * @property {number} birthYear - Fødselsår (beregnet fra oppgitt alder ved oppsett)
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} ComputedChildInfo
 * @property {string} name
 * @property {number} age
 * @property {number} birthYear
 */

/**
 * Returnerer stien til Josefines arbeidsmappe (standard: ~/JosefineHome).
 * @returns {string}
 */
export function getJosefineHomeDir() {
  return process.env.JOSEFINE_HOME || path.join(os.homedir(), "JosefineHome");
}

/**
 * Beregner barnets nåværende alder ut fra fødselsår og inneværende år.
 * @param {ChildProfile | null} profile
 * @param {Date} [now]
 * @returns {ComputedChildInfo | null}
 */
export function computeChildInfo(profile, now = new Date()) {
  if (!profile || !profile.name) return null;
  const name = profile.name.trim();
  const currentYear = now.getFullYear();
  const birthYear =
    typeof profile.birthYear === "number" && profile.birthYear > 1900
      ? profile.birthYear
      : currentYear - 6;
  const age = Math.max(1, currentYear - birthYear);

  return {
    name,
    age,
    birthYear,
  };
}

/**
 * Bygger innholdet i JOSEFINE.md basert på barnets profil.
 * @param {ChildProfile} profile
 * @param {Date} [now]
 * @returns {string}
 */
export function renderJosefineMarkdown(profile, now = new Date()) {
  const info = computeChildInfo(profile, now);
  const childName = info?.name || "barnet";
  const age = info?.age ?? 6;
  const birthYear = info?.birthYear ?? now.getFullYear() - age;

  return [
    "# Josefine 🌸 – Personlig AI-venninne",
    "",
    `Du er **Josefine**, ${childName} sin snille, lekne, trygge og magiske bestevenn og assistent!`,
    `Du snakker alltid direkte med ${childName} på norsk gjennom stemmen din.`,
    "",
    `## Om ${childName}`,
    `- **Navn:** ${childName}`,
    `- **Fødselsår:** ${birthYear} (ca. ${age} år i ${now.getFullYear()})`,
    `- *(Hvis ${childName} forteller når på året hen har bursdag, eller andre morsomme ting om seg selv, lagres det i \`Wiki/\` under refleksjon).*`,
    "",
    "## Kommunikasjon og Tone",
    `- Snakk varmt, tydelig og i korte, engasjerende setninger (1–3 setninger om gangen) tilpasset et barn på ${age} år.`,
    `- Bruk gjerne fantasi, humor, morsomme lydeffekter i stemmen og nysgjerrige spørsmål tilbake til ${childName}.`,
    "- Aldri les opp kode, URL-er, filstier eller tekniske uttrykk høyt.",
    "",
    "## Arbeidsdeling: Josefine (Front) og Arbeidsmauren (Worker)",
    "Josefine kjører på en Raspberry Pi 5 med en skjerm delt i to:",
    `- **Josefine (deg):** Er selve stemmen og ansiktet på høyre side av skjermen (390px bredt panel). Du prater med ${childName} i sanntid uten ventetid.`,
    "- **Arbeidsmauren (Worker):** Er din autonome hjelper i bakgrunnen (Pi SDK) som styrer hele den store venstresiden av skjermen (1130×720). Arbeidsmauren har tilgang til `Skills/`-biblioteket, nettleser, bildevisning, musikk/video og den magiske HTML-tavlen.",
    "",
    "### Hvordan samarbeide med Arbeidsmauren:",
    "1. **Deleger skjerm- og verktøyoppgaver:**",
    `   - Når ${childName} vil se et bilde, høre på en sang, se en video, spille et lite spill, lære bokstaver/tall på skjermen, eller få laget noe visuelt: Kall \`delegate_task({ task: "...", notify_on_complete?: boolean })\`.`,
    `   - Fortell Arbeidsmauren nøyaktig hva ${childName} ønsker (inkludert farger, dyr, tema og detaljer fra samtalen deres).`,
    `   - Gi ${childName} et raskt, koselig svar med én gang (f.eks. *«Å, en babyelefant! Arbeidsmauren henter fram et bilde til oss på skjermen nå!»*).`,
    "2. **Sjekke status:**",
    `   - Hvis ${childName} spør *«Kommer det snart?»* eller *«Hva gjør Arbeidsmauren nå?»*, kall \`get_task_status({})\` og fortell det på en enkel og morsom måte.`,
    "3. **Motta resultat:**",
    `   - Når Arbeidsmauren er ferdig, får du en \`SYSTEM-RAPPORT fra Arbeidsmauren\`. Fortell ${childName} kort og glad hva som har dukket opp på skjermen!`,
    "4. **Rydde skjermen:**",
    `   - Hvis ${childName} sier *«Lukk bildet»*, *«Stopp musikken»* eller *«Ta bort det på skjermen»*, kan du bruke \`close_apps\` direkte.`,
    "",
    "## Kunnskapsbase og minne (Wiki/)",
    `- I mappen \`Wiki/\` (i \`~/JosefineHome/Wiki/\`) lagrer Arbeidsmauren notater om hva ${childName} liker, bursdag, favorittsanger, venner, kosedyr, leker og morsomme ting dere har snakket om.`,
    "- Etter samtaler oppdaterer Arbeidsmauren automatisk `Wiki/` gjennom stille refleksjon.",
    "",
  ].join("\n");
}

/**
 * Sørger for at ~/JosefineHome er opprettet og at standard-skills og scripts er på plass.
 * Rører aldri eksisterende Wiki-artikler eller lokale tilpasninger i JOSEFINE.md.
 *
 * @param {string} repoDir - Sti til Josefine-kodebasen
 * @param {string} [homeDir] - Sti til JosefineHome (standard: ~/JosefineHome)
 */
export function ensureJosefineHome(repoDir, homeDir = getJosefineHomeDir()) {
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(path.join(homeDir, "Wiki"), { recursive: true });
  fs.mkdirSync(path.join(homeDir, "Skills"), { recursive: true });
  fs.mkdirSync(path.join(homeDir, ".pi"), { recursive: true });

  // 1. .pi/settings.json slik at Pi SDK finner Skills/ i homeDir
  const piSettingsPath = path.join(homeDir, ".pi", "settings.json");
  if (!fs.existsSync(piSettingsPath)) {
    fs.writeFileSync(piSettingsPath, JSON.stringify({ skills: ["Skills"] }, null, 2) + "\n", "utf8");
  }

  // 2. Wiki/README.md (kun hvis den ikke finnes fra før)
  const wikiReadmePath = path.join(homeDir, "Wiki", "README.md");
  if (!fs.existsSync(wikiReadmePath)) {
    fs.writeFileSync(
      wikiReadmePath,
      [
        "# Josefines Kunnskapsbase (Wiki) 🌸",
        "",
        "Her lagrer Josefine og Arbeidsmauren notater om barnet, bursdag, interesser, favorittsanger, leker og morsomme ting dere har laget sammen.",
        "Notatene oppdateres automatisk i bakgrunnen etter samtaler.",
        "",
      ].join("\n"),
      "utf8",
    );
  }

  // 3. Symlink scripts/ og node_modules/ fra repoDir inn i homeDir slik at skills og ./scripts/... fungerer fra homeDir
  const repoScripts = path.join(repoDir, "scripts");
  const homeScripts = path.join(homeDir, "scripts");
  if (fs.existsSync(repoScripts) && path.resolve(repoScripts) !== path.resolve(homeScripts)) {
    try {
      if (fs.lstatSync(homeScripts).isSymbolicLink()) {
        fs.unlinkSync(homeScripts);
      }
    } catch {
      // Finnes ikke ennå
    }
    if (!fs.existsSync(homeScripts)) {
      fs.symlinkSync(repoScripts, homeScripts, "dir");
    }
  }

  const repoNodeModules = path.join(repoDir, "node_modules");
  const homeNodeModules = path.join(homeDir, "node_modules");
  if (
    fs.existsSync(repoNodeModules) &&
    path.resolve(repoNodeModules) !== path.resolve(homeNodeModules)
  ) {
    try {
      if (fs.lstatSync(homeNodeModules).isSymbolicLink()) {
        fs.unlinkSync(homeNodeModules);
      }
    } catch {
      // Finnes ikke ennå
    }
    if (!fs.existsSync(homeNodeModules)) {
      fs.symlinkSync(repoNodeModules, homeNodeModules, "dir");
    }
  }

  // 4. Synkroniser standard-skills fra repoDir/Skills til homeDir/Skills
  const repoSkillsDir = path.join(repoDir, "Skills");
  const homeSkillsDir = path.join(homeDir, "Skills");
  if (fs.existsSync(repoSkillsDir) && path.resolve(repoSkillsDir) !== path.resolve(homeSkillsDir)) {
    const entries = fs.readdirSync(repoSkillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const srcSkill = path.join(repoSkillsDir, entry.name);
      const dstSkill = path.join(homeSkillsDir, entry.name);
      if (!fs.existsSync(dstSkill)) {
        fs.cpSync(srcSkill, dstSkill, { recursive: true });
      }
    }
  }

  // 5. Sørg for at AGENTS.md peker på JOSEFINE.md hvis JOSEFINE.md finnes
  const josefineMdPath = path.join(homeDir, "JOSEFINE.md");
  const agentsMdPath = path.join(homeDir, "AGENTS.md");
  if (fs.existsSync(josefineMdPath) && !fs.existsSync(agentsMdPath)) {
    try {
      fs.symlinkSync("JOSEFINE.md", agentsMdPath);
    } catch {
      fs.copyFileSync(josefineMdPath, agentsMdPath);
    }
  }
}

/**
 * Leser lagret profil fra ~/JosefineHome/profile.json.
 * @param {string} [homeDir]
 * @returns {ChildProfile | null}
 */
export function loadChildProfile(homeDir = getJosefineHomeDir()) {
  const profilePath = path.join(homeDir, "profile.json");
  if (!fs.existsSync(profilePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(profilePath, "utf8"));
    if (raw && typeof raw.name === "string" && raw.name.trim()) {
      return raw;
    }
  } catch {
    // Ugyldig JSON
  }
  return null;
}

/**
 * Lagrer barnets profil (navn + alder -> fødselsår) i ~/JosefineHome/profile.json
 * og oppretter/oppdaterer JOSEFINE.md + AGENTS.md.
 *
 * @param {object} input
 * @param {string} input.name - Barnets fornavn
 * @param {number | string} input.age - Barnets alder i år
 * @param {string} [homeDir]
 * @param {Date} [now]
 * @returns {ComputedChildInfo}
 */
export function saveChildProfile(input, homeDir = getJosefineHomeDir(), now = new Date()) {
  fs.mkdirSync(homeDir, { recursive: true });
  const name = String(input.name || "").trim();
  if (!name) {
    throw new Error("Barnets navn må fylles ut.");
  }

  const parsedAge = Math.max(1, Math.min(99, parseInt(String(input.age || "6"), 10) || 6));
  const birthYear = now.getFullYear() - parsedAge;
  const nowIso = now.toISOString();
  const existing = loadChildProfile(homeDir);

  /** @type {ChildProfile} */
  const profile = {
    name,
    birthYear,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  };

  const profilePath = path.join(homeDir, "profile.json");
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2) + "\n", "utf8");

  const josefineMdPath = path.join(homeDir, "JOSEFINE.md");
  const agentsMdPath = path.join(homeDir, "AGENTS.md");
  const markdown = renderJosefineMarkdown(profile, now);
  fs.writeFileSync(josefineMdPath, markdown, "utf8");

  try {
    if (!fs.existsSync(agentsMdPath)) {
      fs.symlinkSync("JOSEFINE.md", agentsMdPath);
    }
  } catch {
    fs.copyFileSync(josefineMdPath, agentsMdPath);
  }

  const info = computeChildInfo(profile, now);
  if (!info) {
    throw new Error("Kunne ikke beregne profilinformasjon.");
  }
  return info;
}
