// @ts-check
import * as fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runJosefineWorkerTask } from "./workerRunner.js";
import { computeChildInfo, getJosefineHomeDir, loadChildProfile } from "./homeManager.js";

/**
 * @fileoverview Samtalelogg og automatisk refleksjon for Josefine.
 * Når en samtale er ferdig (etter en periode med stillhet), kjører
 * Arbeidsmauren en stille bakgrunnsrefleksjon som oppdaterer JOSEFINE.md, Wiki/
 * og eventuelt Skills/ i ~/JosefineHome basert på samtalen.
 */

const DEFAULT_IDLE_REFLECTION_MS = 10 * 60 * 1000; // 10 minutter stillhet etter samtale

/**
 * @typedef {Object} ConversationTurn
 * @property {string} timestamp
 * @property {"user" | "model" | "worker"} role
 * @property {string} text
 */

/**
 * Oppretter en refleksjons- og samtalelogg-håndterer.
 *
 * @param {object} options
 * @param {string} [options.homeDir] - Sti til ~/JosefineHome
 * @param {string} [options.repoDir] - Bakoverkompatibel alias for homeDir
 * @param {string} [options.apiKey]
 * @param {number} [options.idleMs]
 * @param {string} [options.logDir]
 * @param {typeof runJosefineWorkerTask} [options.workerRunner]
 * @param {(msg: string) => void} [options.onLog]
 */
export function createReflectionManager(options) {
  const {
    apiKey,
    idleMs = DEFAULT_IDLE_REFLECTION_MS,
    logDir = path.join(os.homedir(), ".local", "state", "josefine", "conversations"),
    workerRunner = runJosefineWorkerTask,
    onLog = () => {},
  } = options;
  const homeDir = options.homeDir || options.repoDir || getJosefineHomeDir();

  fs.mkdirSync(logDir, { recursive: true });

  /** @type {ConversationTurn[]} */
  let unreflectedTurns = [];
  /** @type {ReturnType<typeof setTimeout> | null} */
  let idleTimer = null;
  let isReflecting = false;

  /**
   * Skriver en tur til dagens JSONL-samtalelogg.
   * @param {ConversationTurn} turn
   */
  function appendToDailyLog(turn) {
    const day = turn.timestamp.slice(0, 10);
    const file = path.join(logDir, `${day}.jsonl`);
    fs.appendFileSync(file, JSON.stringify(turn) + "\n", "utf8");
  }

  /**
   * Registrerer en ferdig tur fra barnet ('user'), Josefine ('model') eller Arbeidsmauren ('worker').
   * @param {"user" | "model" | "worker"} role
   * @param {string} text
   */
  function recordTurn(role, text) {
    const cleaned = String(text || "").trim();
    if (!cleaned) return;

    /** @type {ConversationTurn} */
    const turn = {
      timestamp: new Date().toISOString(),
      role,
      text: cleaned,
    };

    appendToDailyLog(turn);
    unreflectedTurns.push(turn);
    scheduleReflection();
  }

  function scheduleReflection() {
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    idleTimer = setTimeout(() => {
      runReflectionNow().catch((err) => {
        onLog(`Refleksjonsfeil: ${err instanceof Error ? err.message : String(err)}`);
      });
    }, idleMs);
    if (typeof idleTimer.unref === "function") {
      idleTimer.unref();
    }
  }

  /**
   * Kjører refleksjon umiddelbart på oppsamlede samtaleturer.
   * @returns {Promise<boolean>}
   */
  async function runReflectionNow() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (isReflecting || unreflectedTurns.length === 0) {
      return false;
    }

    const hasUserTurn = unreflectedTurns.some((t) => t.role === "user");
    if (!hasUserTurn) {
      unreflectedTurns = [];
      return false;
    }

    const turnsToReflect = [...unreflectedTurns];
    unreflectedTurns = [];
    isReflecting = true;

    const childInfo = computeChildInfo(loadChildProfile(homeDir));
    const childName = childInfo?.name || "Barnet";

    const formattedTranscript = turnsToReflect
      .map((t) => {
        const speaker =
          t.role === "user" ? childName : t.role === "model" ? "Josefine" : "Arbeidsmauren";
        return `[${t.timestamp}] ${speaker}: ${t.text}`;
      })
      .join("\n");

    const reflectionTask = [
      `STILLE REFLEKSJON ETTER SAMTALE MED ${childName.toUpperCase()}:`,
      `Samtalen med ${childName} er nå avsluttet for denne gang. Dette er en intern bakgrunnsjobb.`,
      "VIKTIG: Du skal IKKE åpne noen vinduer på skjermen (ikke kall open-window.sh eller open-app.sh) og IKKE spille av lyd.",
      "",
      "Her er samtaleloggen:",
      "---",
      formattedTranscript,
      "---",
      "",
      `Gjør en kort refleksjon i arbeidsmappen (${homeDir}):`,
      `1. Sjekk om ${childName} fortalte noe nytt om hva hen liker, favorittsanger, venner, kosedyr, leker eller hva dere har laget/snakket om sammen.`,
      "   - Hvis ja: Oppdater relevante notater i `Wiki/` (f.eks. `Wiki/interesser-og-favoritter.md`) og/eller `JOSEFINE.md`.",
      "2. Sjekk om noe teknisk feilet eller krevde ekstra forsøk underveis.",
      "   - Hvis ja: Oppdater eller forbedre relevant `Skills/<navn>/SKILL.md` slik at det sitter på første forsøk neste gang.",
      "3. Hvis samtalen var helt kort og ikke ga ny varig kunnskap, trenger du ikke endre noen filer.",
    ].join("\n");

    try {
      onLog(`Starter stille refleksjon over ${turnsToReflect.length} samtaleturer...`);
      const { summary } = await workerRunner({
        taskId: `reflect-${Date.now()}`,
        task: reflectionTask,
        homeDir,
        apiKey,
      });
      onLog(`Refleksjon fullført: ${summary}`);
      return true;
    } finally {
      isReflecting = false;
    }
  }

  function stop() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  return {
    recordTurn,
    runReflectionNow,
    stop,
  };
}
