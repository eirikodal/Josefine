// @ts-check
import path from "node:path";
import os from "node:os";
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  DefaultResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { computeChildInfo, getJosefineHomeDir, loadChildProfile } from "./homeManager.js";

/**
 * @fileoverview Arbeidsmauren (Worker) for Josefine.
 * Kjører en autonom Pi SDK-agent (@earendil-works/pi-coding-agent) i bakgrunnen
 * med tilgang til ~/JosefineHome/Skills/, bash, read, write og edit for å løse oppgaver
 * og styre venstresiden av skjermen.
 */

const GOOGLE_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Henter siste tekstsvar fra agentens meldingshistorikk.
 * @param {Array<any>} messages
 * @returns {string}
 */
function extractLastAssistantText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant" || !Array.isArray(msg.content)) continue;
    const textParts = msg.content
      .filter((block) => block?.type === "text" && typeof block.text === "string")
      .map((block) => block.text.trim())
      .filter(Boolean);
    if (textParts.length > 0) {
      return textParts.join("\n\n");
    }
  }
  return "";
}

/**
 * Kjører en oppgave hos Arbeidsmauren via Pi SDK.
 *
 * @param {object} options
 * @param {string} options.taskId
 * @param {string} options.task
 * @param {string} [options.homeDir] - Sti til ~/JosefineHome (cwd for Arbeidsmauren)
 * @param {string} [options.repoDir] - Bakoverkompatibel alias for homeDir
 * @param {string} [options.apiKey]
 * @param {(step: string) => void} [options.onProgress]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ summary: string }>}
 */
export async function runJosefineWorkerTask(options) {
  const { taskId, task, apiKey, onProgress, signal } = options;
  const workDir = options.homeDir || options.repoDir || getJosefineHomeDir();
  const childInfo = computeChildInfo(loadChildProfile(workDir));
  const childName = childInfo?.name || "barnet";
  const ageDesc = childInfo?.age != null ? ` (${childInfo.age} år)` : "";

  const agentDir = path.join(os.homedir(), ".pi", "agent");
  const modelRuntime = await ModelRuntime.create({
    authPath: path.join(agentDir, "auth.json"),
    modelsPath: path.join(agentDir, "models.json"),
  });

  const googleKey = apiKey || process.env.GEMINI_API_KEY || "";
  if (googleKey) {
    await modelRuntime.setRuntimeApiKey("google", googleKey);
  }

  // Velg rask arbeidsmodell (gemini-3.8-flash fra lokal models.json, eller registrer direkte)
  let model =
    modelRuntime.getModel("google", "gemini-3.8-flash") ||
    modelRuntime.getModel("google", "gemini-2.5-flash");

  if (!model) {
    modelRuntime.registerProvider("google", {
      baseUrl: GOOGLE_API_BASE_URL,
      apiKey: googleKey || "GEMINI_API_KEY",
      api: "google-generative-ai",
      models: [
        {
          id: "gemini-3.8-flash",
          name: "Gemini 3.8 Flash",
          reasoning: true,
          input: ["text", "image"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 1048576,
          maxTokens: 65536,
        },
      ],
    });
    model = modelRuntime.getModel("google", "gemini-3.8-flash");
  }

  const settingsManager = SettingsManager.create(workDir, agentDir);
  const resourceLoader = new DefaultResourceLoader({
    cwd: workDir,
    agentDir,
    settingsManager,
    appendSystemPromptOverride: () => [
      `Du er Arbeidsmauren, bakgrunnsagenten til Josefine (${childName}${ageDesc} sin AI-venninne).`,
      `Josefine (Gemini Live) snakker med ${childName} på høyre side av skjermen (390px), mens du disponerer den store arbeidsflaten til venstre (1130×720) i Hyprland.`,
      `Arbeidsmappen din (cwd) er ${workDir}.`,
      `Slik løser du oppgaver:`,
      `1. Sjekk alltid relevante ferdigheter i Skills/ (bruk read på SKILL.md når en oppgave matcher).`,
      `2. Når du skal vise noe visuelt på skjermen (bilde, magisk HTML-tavle, spill, video), bruk skriptene i ./scripts/open-window.sh eller ./scripts/open-app.sh slik at det åpnes i venstre felt.`,
      `3. Når du er ferdig, skriv en kort, barnevennlig oppsummering (1–2 setninger) av hva du har lagt fram på skjermen, slik at Josefine kan fortelle det til ${childName}.`,
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

  if (signal) {
    if (signal.aborted) {
      await session.abort();
      throw new Error("Oppgaven ble avbrutt.");
    }
    signal.addEventListener(
      "abort",
      () => {
        session.abort().catch(() => {});
      },
      { once: true },
    );
  }

  const unsubscribe = session.subscribe((event) => {
    if (event.type === "tool_execution_start" && onProgress) {
      const toolName = event.toolName || "verktøy";
      const cmdPreview =
        event.args && typeof event.args.command === "string"
          ? `: ${event.args.command.slice(0, 60)}`
          : event.args && typeof event.args.path === "string"
            ? `: ${path.basename(event.args.path)}`
            : "";
      onProgress(`Kjører ${toolName}${cmdPreview}`);
    }
  });

  try {
    const prompt = [
      `[OPPGAVE ${taskId} FRA JOSEFINE]`,
      task,
      "",
      `Utfør oppgaven nå og avslutt med en kort rapport (1–2 setninger) om hva du har gjort for ${childName}.`,
    ].join("\n");

    await session.prompt(prompt);
    const summary =
      extractLastAssistantText(session.messages) || "Oppgaven er utført på skjermen.";
    return { summary };
  } finally {
    unsubscribe();
  }
}
