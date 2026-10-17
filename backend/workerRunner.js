// @ts-check
import path from "node:path";
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  DefaultResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { getJosefineHomeDir } from "./homeManager.js";

/**
 * @fileoverview Arbeidsmauren (Worker Runner) for Josefine.
 * Kjører en full Pi SDK-agent (@earendil-works/pi-coding-agent) i bakgrunnen med
 * ~/JosefineHome som arbeidsmappe (der JOSEFINE.md/AGENTS.md, Wiki/ og Skills/ bor).
 */

/**
 * Kjører en oppgave i Arbeidsmauren.
 *
 * @param {object} options
 * @param {string} options.taskId
 * @param {string} options.task
 * @param {string} [options.homeDir] - Sti til ~/JosefineHome
 * @param {string} [options.apiKey]
 * @param {AbortSignal} [options.signal]
 * @param {(step: string) => void} [options.onProgress]
 * @param {(session: { steer: (text: string) => Promise<any> }) => void} [options.onSessionReady]
 * @returns {Promise<{ summary: string }>}
 */
export async function runJosefineWorkerTask(options) {
  const {
    taskId,
    task,
    homeDir = getJosefineHomeDir(),
    apiKey,
    signal,
    onProgress,
    onSessionReady,
  } = options;

  const workDir = path.resolve(homeDir);
  const agentDir = path.join(workDir, ".pi", "agent");

  const modelRuntime = await ModelRuntime.create(path.join(agentDir, "models.json"));

  const googleKey = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (googleKey) {
    await modelRuntime.setRuntimeApiKey("google", googleKey);
  }

  const provider = process.env.JOSEFINE_WORKER_PROVIDER || "google";
  const modelId = process.env.JOSEFINE_WORKER_MODEL || "gemini-3-flash-preview";

  const model =
    modelRuntime.getModel(provider, modelId) ||
    modelRuntime.getModel("google", "gemini-2.5-flash");

  if (!model) {
    throw new Error(`Fant ikke modell ${provider}/${modelId} for Arbeidsmauren.`);
  }

  const settingsManager = SettingsManager.create(workDir, agentDir);
  const resourceLoader = new DefaultResourceLoader({
    cwd: workDir,
    agentDir,
    settingsManager,
    appendSystemPromptOverride: (base) => [
      ...base,
      [
        "## Din rolle: Arbeidsmauren (Josefines bakgrunns- og skjermagent)",
        "Du er Arbeidsmauren – den autonome bakgrunnsagenten til barneassistenten Josefine.",
        "Josefine (Gemini Live) snakker direkte med barnet i sanntid til høyre på skjermen (390px bredde), mens du styrer venstresiden av skjermen (1130x720 på en 1520x720 skjerm) og utfører oppgaver ved hjelp av Skills/, bash og verktøy.",
        "",
        "### Regler for Arbeidsmauren:",
        "1. Utfør oppgaven raskt, kreativt og barnevennlig.",
        "2. Sjekk relevante ferdigheter i `Skills/` (f.eks. `vis-bilde`, `spotify`, `magisk-tavle`, `skjerm-kontroll`, `browser-tools`, `brave-search`).",
        "3. Når du åpner nettsider eller apper på skjermen, bruk ALLTID `./scripts/open-window.sh <url-eller-fil>` slik at Chromium åpner i ren web-app-modus (`--app=<url>`) uten nettleser-menyer eller adresselinje.",
        "4. Når du er ferdig, skriv en kort, varm oppsummering (1–2 setninger) av hva du har gjort eller lagt frem på skjermen, slik at Josefine kan fortelle det til barnet.",
      ].join("\n"),
    ],
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: workDir,
    agentDir,
    model,
    thinkingLevel: "low",
    modelRuntime,
    sessionManager: SessionManager.inMemory(workDir),
    settingsManager,
    resourceLoader,
  });

  if (onSessionReady) {
    onSessionReady(session);
  }

  let lastAssistantText = "";

  const unsubscribe = session.subscribe((event) => {
    if (event.type === "tool_execution_start") {
      const toolName = event.toolName;
      let detail = `Kjører ${toolName}`;
      const args = /** @type {Record<string, any> | undefined} */ (event.args);
      if (toolName === "bash" && typeof args?.command === "string") {
        detail = `Kjører bash: ${args.command.slice(0, 60)}`;
      } else if (toolName === "read" && typeof args?.path === "string") {
        detail = `Leser: ${path.basename(args.path)}`;
      } else if (toolName === "write" && typeof args?.path === "string") {
        detail = `Skriver: ${path.basename(args.path)}`;
      }
      if (onProgress) onProgress(detail);
    } else if (event.type === "message_end") {
      const msg = /** @type {any} */ (event.message);
      if (msg && msg.role === "assistant" && Array.isArray(msg.content)) {
        const text = msg.content
          .filter((/** @type {any} */ c) => c.type === "text" && typeof c.text === "string")
          .map((/** @type {any} */ c) => c.text)
          .join("\n")
          .trim();
        if (text) {
          lastAssistantText = text;
        }
      }
    }
  });

  const onAbort = () => {
    session.abort().catch(() => {});
  };
  if (signal) {
    if (signal.aborted) {
      unsubscribe();
      session.dispose();
      throw new Error(`Oppgave ${taskId} ble avbrutt før start.`);
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    await session.prompt(`Oppgave fra Josefine (#${taskId}):\n\n${task}`);
    return {
      summary: lastAssistantText || "Oppgaven er utført på skjermen.",
    };
  } finally {
    if (signal) {
      signal.removeEventListener("abort", onAbort);
    }
    unsubscribe();
    session.dispose();
  }
}
