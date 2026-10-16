// @ts-check
import * as fs from "node:fs";
import path from "node:path";
import * as readline from "node:readline";
import { fileURLToPath } from "node:url";
import { GeminiLiveClient } from "./geminiLive.js";
import { AudioRecorder, AudioPlayer } from "./audio.js";
import { JOSEFINE_TOOLS, createAgentDispatcher } from "./agentDispatcher.js";
import { buildJosefineSystemPrompt } from "./systemPrompt.js";
import { createReflectionManager } from "./reflection.js";
import { startNightSchedule } from "./nightSchedule.js";
import { analyzePcmChunk } from "./vad.js";
import {
  computeChildInfo,
  ensureJosefineHome,
  getJosefineHomeDir,
  loadChildProfile,
  saveChildProfile,
} from "./homeManager.js";

/**
 * @fileoverview Hovedtjeneste og IPC-bro for Josefine AI.
 * Knytter Quickshell UI sammen med Gemini Live (Front-agenten med kontinuerlig mikrofon
 * og Geminis innebygde server-VAD) og Arbeidsmauren (Pi SDK bakgrunnsagenten i ~/JosefineHome).
 * Skrevet i ren JavaScript med JSDoc.
 */

const REPO_DIR =
  process.env.JOSEFINE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME_DIR = getJosefineHomeDir();
const DEBUG_LOG = "/tmp/josefine-debug.log";
fs.writeFileSync(
  DEBUG_LOG,
  `[${new Date().toISOString()}] Josefine backend startet (repo=${REPO_DIR}, home=${HOME_DIR})\n`,
);

/**
 * @param {string} msg
 */
function debug(msg) {
  fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${msg}\n`);
}

/**
 * Sørg for at stdout tømmes linje for linje
 * @param {Record<string, any>} msg
 */
function emitIpc(msg) {
  debug(`IPC -> UI: ${JSON.stringify(msg)}`);
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function main() {
  ensureJosefineHome(REPO_DIR, HOME_DIR);

  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    emitIpc({
      type: "status",
      message: "⚠️ Mangler GEMINI_API_KEY. Vennligst sett denne i ~/.config/josefine/env",
    });
    emitIpc({ type: "state", state: "idle" });
  }

  const voice = process.env.JOSEFINE_VOICE || "Aoede";
  const silenceDurationMs = parseInt(process.env.JOSEFINE_VAD_SILENCE_MS || "900", 10);
  const conversationIdleTimeoutMs = parseInt(
    process.env.JOSEFINE_VAD_IDLE_TIMEOUT_MS || "15000",
    10,
  );
  const systemInstruction = await buildJosefineSystemPrompt(HOME_DIR);

  const gemini = new GeminiLiveClient({
    apiKey,
    model: "models/gemini-3.8-live",
    voice,
    silenceDurationMs,
    systemInstruction,
    tools: JOSEFINE_TOOLS,
  });

  const recorder = new AudioRecorder();
  const player = new AudioPlayer();

  let currentState = "idle";
  let conversationActive = false;
  let awaitingModelTurnComplete = false;
  let activeToolCalls = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let conversationIdleTimer = null;
  let echoGuardUntil = 0;

  let recordedBytes = 0;
  let nonZeroBytes = 0;
  let peakSample = 0;
  let sentAudioBytes = 0;
  let inputTranscript = "";
  let outputTranscript = "";
  /** @type {string[]} */
  const pendingWorkerReports = [];

  function getChildName() {
    const info = computeChildInfo(loadChildProfile(HOME_DIR));
    return info?.name || "vennen min";
  }

  function clearConversationIdleTimer() {
    if (conversationIdleTimer) {
      clearTimeout(conversationIdleTimer);
      conversationIdleTimer = null;
    }
  }

  function resetConversationIdleTimer() {
    clearConversationIdleTimer();
    if (!conversationActive || conversationIdleTimeoutMs <= 0) return;
    conversationIdleTimer = setTimeout(() => {
      if (
        conversationActive &&
        currentState === "listening" &&
        !player.isPlaying &&
        !awaitingModelTurnComplete &&
        activeToolCalls === 0
      ) {
        debug(`Ingen tale på ${conversationIdleTimeoutMs}ms – avslutter samtaleøkten til idle.`);
        if (recordedBytes > 0 && nonZeroBytes === 0) {
          emitIpc({
            type: "status",
            message: "Opptaket inneholder bare nullverdier. Sjekk mikrofonen.",
          });
        }
        endConversationToIdle();
      }
    }, conversationIdleTimeoutMs);
    if (typeof conversationIdleTimer.unref === "function") {
      conversationIdleTimer.unref();
    }
  }

  function flushNextWorkerReportIfReady() {
    if (
      (currentState !== "idle" && currentState !== "listening") ||
      pendingWorkerReports.length === 0 ||
      player.isPlaying ||
      awaitingModelTurnComplete ||
      activeToolCalls > 0
    ) {
      return false;
    }
    if (!gemini.isReady) return false;
    const report = pendingWorkerReports.shift();
    if (!report) return false;
    debug(`Sender rapport fra Arbeidsmauren til Gemini Live: ${report}`);
    clearConversationIdleTimer();
    awaitingModelTurnComplete = true;
    setState("thinking");
    gemini.sendUserText(report);
    return true;
  }

  /**
   * @param {string} newState
   */
  function setState(newState) {
    if (currentState === newState) return;
    debug(`Tilstandsendring: ${currentState} -> ${newState}`);
    currentState = newState;
    emitIpc({ type: "state", state: newState });

    if (newState === "idle" || newState === "listening") {
      setTimeout(() => {
        flushNextWorkerReportIfReady();
      }, 150);
    }
  }

  function startConversation() {
    conversationActive = true;
    awaitingModelTurnComplete = false;
    player.stop();
    if (!recorder.isRecording) {
      recorder.start();
    }
    setState("listening");
    resetConversationIdleTimer();
  }

  function endConversationToIdle() {
    conversationActive = false;
    awaitingModelTurnComplete = false;
    clearConversationIdleTimer();
    recorder.stop();
    gemini.endAudioStream();
    player.stop();
    setState("idle");
  }

  function syncStateAfterResponse() {
    if (awaitingModelTurnComplete || activeToolCalls > 0 || player.isPlaying) {
      return;
    }
    if (flushNextWorkerReportIfReady()) {
      return;
    }
    if (conversationActive) {
      // 350 ms ekko-beskyttelse etter at høyttaleren er ferdig før mikrofonpakkene slippes ufiltrert gjennom
      echoGuardUntil = Date.now() + 350;
      if (!recorder.isRecording) {
        recorder.start();
      }
      setState("listening");
      resetConversationIdleTimer();
    } else {
      setState("idle");
    }
  }

  async function connectOrReconnectGemini() {
    if (!apiKey) return;
    gemini.close();
    gemini.systemInstruction = await buildJosefineSystemPrompt(HOME_DIR);
    try {
      debug("Kobler til Gemini Live...");
      await gemini.connect();
      debug("Tilkoblet Gemini Live ok.");
      emitIpc({ type: "status", message: "Josefine er tilkoblet og klar!" });
      emitIpc({ type: "ready" });
      setState("idle");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      debug(`Tilkoblingsfeil: ${errMsg}`);
      emitIpc({
        type: "status",
        message: `Tilkoblingsfeil: ${errMsg}`,
      });
    }
  }

  const nightSchedule = startNightSchedule({
    repoDir: REPO_DIR,
    onLog: debug,
  });

  const reflection = createReflectionManager({
    homeDir: HOME_DIR,
    apiKey,
    onLog: debug,
  });

  const dispatcher = createAgentDispatcher({
    repoDir: REPO_DIR,
    homeDir: HOME_DIR,
    apiKey,
    onProgress: (_taskId, step) => {
      debug(`Arbeidsmauren fremdrift: ${step}`);
      if (currentState === "idle" || currentState === "listening") {
        emitIpc({
          type: "status",
          message: `🐜 Arbeidsmauren: ${step}`,
        });
      }
    },
    onTaskCompleted: (record) => {
      debug(`Arbeidsmauren ferdig med ${record.id} (status=${record.status})`);
      reflection.recordTurn(
        "worker",
        `Oppgave "${record.task}" (${record.status}): ${record.resultSummary || record.error || ""}`,
      );
      if (!record.notifyOnComplete) {
        if ((currentState === "idle" || currentState === "listening") && record.resultSummary) {
          emitIpc({
            type: "status",
            message: `✨ ${record.resultSummary}`,
          });
        }
        return;
      }

      const childName = getChildName();
      if (record.status === "completed") {
        const report =
          `SYSTEM-RAPPORT fra Arbeidsmauren (oppgave ${record.id} fullført): ` +
          `${record.resultSummary || "Oppgaven er utført på skjermen."}\n` +
          `Fortell ${childName} kort og glad (1–2 setninger) hva som nå vises på skjermen!`;
        pendingWorkerReports.push(report);
        flushNextWorkerReportIfReady();
      } else if (record.status === "failed") {
        const report =
          `SYSTEM-RAPPORT fra Arbeidsmauren (oppgave ${record.id} feilet): ` +
          `${record.error || "Ukjent feil."}\n` +
          `Fortell ${childName} vennlig at Arbeidsmauren snublet litt og spør om vi skal prøve på nytt.`;
        pendingWorkerReports.push(report);
        flushNextWorkerReportIfReady();
      }
    },
  });

  // 1. Koble opp kontinuerlig lydopptak til Gemini Live
  recorder.on("start", (device) => {
    recordedBytes = 0;
    nonZeroBytes = 0;
    peakSample = 0;
    sentAudioBytes = 0;
    inputTranscript = "";
    outputTranscript = "";
    debug(`Kontinuerlig opptak startet på device: ${device}`);
  });

  recorder.on("data", (chunk) => {
    recordedBytes += chunk.length;
    for (const byte of chunk) if (byte !== 0) nonZeroBytes++;
    const { peak } = analyzePcmChunk(chunk);
    if (peak > peakSample) peakSample = peak;

    if (nonZeroBytes === 0) {
      return;
    }

    const muteForEcho = player.isPlaying || Date.now() < echoGuardUntil;
    const outboundChunk = muteForEcho ? Buffer.alloc(chunk.length) : chunk;

    if (!muteForEcho && peak >= 950 && currentState === "listening") {
      resetConversationIdleTimer();
    }

    if (gemini.sendAudioChunk(outboundChunk)) {
      sentAudioBytes += outboundChunk.length;
    }
  });

  recorder.on("captureError", (message) => {
    debug(`Opptaksfeil: ${message}`);
    endConversationToIdle();
    emitIpc({ type: "status", message: `Opptaksfeil: ${message}` });
  });

  recorder.on("stop", (code) => {
    debug(
      `Opptak stoppet: code=${code}, bytes=${recordedBytes}, nonZeroBytes=${nonZeroBytes}, peak=${peakSample}, sentAudioBytes=${sentAudioBytes}`,
    );
  });

  // 2. Koble opp Gemini til høyttaler
  gemini.on("audio", (chunk) => {
    clearConversationIdleTimer();
    setState("speaking");
    player.playChunk(chunk);
  });

  gemini.on("inputTranscript", (text) => {
    inputTranscript += text;
    debug(`Gemini hørte: ${inputTranscript}`);
    resetConversationIdleTimer();
    emitIpc({ type: "transcript", role: "user", text: `Du sa: ${inputTranscript}` });
  });

  gemini.on("outputTranscript", (text) => {
    outputTranscript += text;
    debug(`Gemini svarte: ${outputTranscript}`);
    emitIpc({ type: "transcript", role: "model", text: outputTranscript });
  });

  gemini.on("text", (text) => {
    debug(`Gemini tekst: ${text}`);
    emitIpc({ type: "transcript", role: "model", text });
  });

  gemini.on("interrupted", () => {
    debug("Gemini ble avbrutt av brukeren.");
    player.stop();
  });

  player.on("playbackError", (message) => {
    debug(`Avspillingsfeil: ${message}`);
    player.stop();
    syncStateAfterResponse();
    emitIpc({ type: "status", message: `Avspillingsfeil: ${message}` });
  });

  player.on("playEnd", () => {
    debug("AudioPlayer playEnd mottatt.");
    syncStateAfterResponse();
  });

  gemini.on("turnComplete", () => {
    debug("Gemini turnComplete mottatt.");
    awaitingModelTurnComplete = false;
    if (inputTranscript.trim()) {
      reflection.recordTurn("user", inputTranscript.trim());
      inputTranscript = "";
    }
    if (outputTranscript.trim()) {
      reflection.recordTurn("model", outputTranscript.trim());
      outputTranscript = "";
    }
    player.finish();
    syncStateAfterResponse();
  });

  gemini.on("toolCall", async (toolCall) => {
    debug(`Verktøykall: ${toolCall.name} med args: ${JSON.stringify(toolCall.args)}`);
    activeToolCalls++;
    awaitingModelTurnComplete = true;
    clearConversationIdleTimer();
    emitIpc({
      type: "status",
      message:
        toolCall.name === "delegate_task"
          ? "🐜 Setter Arbeidsmauren på saken..."
          : `🌸 Utfører: ${toolCall.name}...`,
    });
    try {
      const result = await dispatcher.executeTool(toolCall.name, toolCall.args);
      gemini.sendToolResponse(toolCall.id, toolCall.name, result);
    } finally {
      activeToolCalls = Math.max(0, activeToolCalls - 1);
    }
  });

  gemini.on("error", (err) => {
    debug(`Gemini feil: ${err.message || err}`);
    emitIpc({ type: "status", message: `Feil: ${err.message || err}` });
  });

  gemini.on("close", (code, reason) => {
    debug(`Gemini lukket: code=${code}, reason=${reason}`);
    endConversationToIdle();
    emitIpc({
      type: "status",
      message: `Gemini-tilkoblingen ble lukket (${code}). Start Josefine på nytt.`,
    });
  });

  // 3. Sjekk om barnets profil er satt opp i ~/JosefineHome, og koble til Gemini Live
  const existingProfile = computeChildInfo(loadChildProfile(HOME_DIR));
  if (existingProfile) {
    emitIpc({
      type: "profile",
      name: existingProfile.name,
      age: existingProfile.age,
      birthYear: existingProfile.birthYear,
    });
    emitIpc({ type: "onboarding_required", required: false });
    await connectOrReconnectGemini();
  } else {
    emitIpc({ type: "onboarding_required", required: true });
    emitIpc({
      type: "status",
      message: "Hei! Fortell meg hva du heter og hvor gammel du er, så er vi klare!",
    });
  }

  // 4. Lytt på kommandoer fra Quickshell (stdin IPC)
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    debug(`Quickshell -> Backend: ${trimmed}`);

    try {
      const msg = JSON.parse(trimmed);
      switch (msg.action) {
        case "complete_onboarding": {
          const info = saveChildProfile(
            {
              name: msg.name,
              age: msg.age,
            },
            HOME_DIR,
          );
          emitIpc({
            type: "profile",
            name: info.name,
            age: info.age,
            birthYear: info.birthYear,
          });
          emitIpc({ type: "onboarding_required", required: false });
          connectOrReconnectGemini().catch((err) => {
            debug(`Feil etter onboarding: ${err}`);
          });
          break;
        }

        case "start_listening": {
          startConversation();
          break;
        }

        case "stop_listening":
        case "stop_conversation":
        case "cancel": {
          debug("Brukeren avsluttet samtalen via knappen.");
          endConversationToIdle();
          break;
        }

        case "text_input": {
          if (msg.text) {
            reflection.recordTurn("user", msg.text);
            awaitingModelTurnComplete = true;
            setState("thinking");
            gemini.sendUserText(msg.text);
          }
          break;
        }

        default:
          break;
      }
    } catch {
      // Ignorer ugyldig JSON fra stdin
    }
  });

  // Rydd opp ved avslutning
  process.on("SIGTERM", () => {
    debug("SIGTERM mottatt, avslutter.");
    nightSchedule.stop();
    reflection.stop();
    endConversationToIdle();
    gemini.close();
    process.exit(0);
  });
  process.on("SIGINT", () => {
    debug("SIGINT mottatt, avslutter.");
    nightSchedule.stop();
    reflection.stop();
    endConversationToIdle();
    gemini.close();
    process.exit(0);
  });
}

main().catch((err) => {
  const errMsg = err instanceof Error ? err.message : String(err);
  debug(`Kritisk feil: ${errMsg}`);
  emitIpc({ type: "status", message: `Kritisk feil: ${errMsg}` });
  process.exit(1);
});
