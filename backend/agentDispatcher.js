// @ts-check
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { TaskStore } from "./taskStore.js";
import { runJosefineWorkerTask } from "./workerRunner.js";
import { getJosefineHomeDir } from "./homeManager.js";

const execFileAsync = promisify(execFile);

/**
 * @fileoverview Verktøy-dispatcher for Josefine (Front-agenten i Gemini Live).
 * Josefine har en lett og rask front-rolle, og delegerer skjerm-, nettleser-,
 * musikk- og tavle-oppgaver til Arbeidsmauren (Pi SDK Worker) i bakgrunnen.
 */

export const JOSEFINE_TOOLS = [
  {
    name: "delegate_task",
    description:
      "Delegerer en oppgave til Arbeidsmauren (din autonome bakgrunnsagent som styrer venstresiden av skjermen). " +
      "Brukes når barnet vil se bilder (f.eks. dinosaur, kattunge), høre musikk/se video, eller få laget en magisk interaktiv tavle/spill/tegning på skjermen. " +
      "Returnerer umiddelbart slik at du kan fortsette å prate mens Arbeidsmauren jobber!",
    parameters: {
      type: "OBJECT",
      properties: {
        task: {
          type: "STRING",
          description:
            "Detaljert beskrivelse av hva Arbeidsmauren skal gjøre eller vise på skjermen. Inkluder alle relevante detaljer fra samtalen.",
        },
        notify_on_complete: {
          type: "BOOLEAN",
          description:
            "Sett til true (standard) hvis Josefine skal få beskjed og fortelle barnet når oppgaven er ferdig på skjermen.",
        },
      },
      required: ["task"],
    },
  },
  {
    name: "get_task_status",
    description:
      "Sjekker status og hva Arbeidsmauren gjør akkurat nå. Bruk dette hvis barnet spør 'Kommer det snart?' eller 'Hva gjør Arbeidsmauren nå?'.",
    parameters: {
      type: "OBJECT",
      properties: {
        task_id: {
          type: "STRING",
          description: "Valgfri oppgave-ID. Hvis utelatt, vises siste/aktive oppgave.",
        },
      },
    },
  },
  {
    name: "cancel_task",
    description:
      "Avbryter en pågående oppgave hos Arbeidsmauren hvis barnet ombestemmer seg.",
    parameters: {
      type: "OBJECT",
      properties: {
        task_id: {
          type: "STRING",
          description: "Valgfri oppgave-ID som skal avbrytes (avbryter aktiv oppgave hvis utelatt).",
        },
      },
    },
  },
  {
    name: "close_apps",
    description:
      "Lukker åpne vinduer på venstresiden av skjermen når barnet er ferdig med å se på bilder, tavle eller video.",
    parameters: {
      type: "OBJECT",
      properties: {},
    },
  },
];

/**
 * Oppretter en verktøy-dispatcher som knytter Josefine (Gemini Live) til Arbeidsmauren (Pi SDK).
 *
 * @param {object} options
 * @param {string} options.repoDir - Sti til Josefine-kodebasen (for scripts/)
 * @param {string} [options.homeDir] - Sti til ~/JosefineHome (for Arbeidsmauren)
 * @param {string} [options.apiKey] - Gemini API-nøkkel
 * @param {TaskStore} [options.taskStore] - Valgfri TaskStore-instans
 * @param {typeof runJosefineWorkerTask} [options.workerRunner] - Valgfri worker-runner (for testing)
 * @param {(record: import("./taskStore.js").TaskRecord) => void} [options.onTaskCompleted] - Kalles når en bakgrunnsoppgave er ferdig
 * @param {(taskId: string, step: string) => void} [options.onProgress] - Kalles ved fremdrift hos Arbeidsmauren
 */
export function createAgentDispatcher(options) {
  const {
    repoDir,
    homeDir = getJosefineHomeDir(),
    apiKey,
    taskStore = new TaskStore(),
    workerRunner = runJosefineWorkerTask,
    onTaskCompleted,
    onProgress,
  } = options;

  const scriptsDir = path.join(repoDir, "scripts");
  /** @type {Map<string, AbortController>} */
  const activeControllers = new Map();

  /**
   * Kjører et verktøykall fra Gemini Live og returnerer svaret umiddelbart.
   * @param {string} name
   * @param {Record<string, any>} args
   * @returns {Promise<Record<string, any>>}
   */
  async function executeTool(name, args) {
    try {
      switch (name) {
        case "delegate_task": {
          const taskText = String(args.task || "").trim();
          if (!taskText) {
            return { status: "error", message: "Mangler oppgavebeskrivelse (task)." };
          }
          const notifyOnComplete = args.notify_on_complete !== false;
          const record = await taskStore.createTask({
            task: taskText,
            notifyOnComplete,
          });

          const controller = new AbortController();
          activeControllers.set(record.id, controller);

          // Start Arbeidsmauren asynkront i bakgrunnen med homeDir som arbeidsmappe
          (async () => {
            await taskStore.updateRecord(record.id, {
              status: "running",
              startedAt: new Date().toISOString(),
              currentStep: "Arbeidsmauren jobber...",
            });

            try {
              const { summary } = await workerRunner({
                taskId: record.id,
                task: taskText,
                homeDir,
                apiKey,
                signal: controller.signal,
                onProgress: (step) => {
                  taskStore.updateRecord(record.id, { currentStep: step }).catch(() => {});
                  taskStore.appendEvent(record.id, step).catch(() => {});
                  if (onProgress) onProgress(record.id, step);
                },
              });
              if (controller.signal.aborted) return;
              const completed = await taskStore.updateRecord(record.id, {
                status: "completed",
                completedAt: new Date().toISOString(),
                currentStep: "Ferdig!",
                resultSummary: summary,
              });
              await taskStore.appendEvent(record.id, `Fullført: ${summary}`);
              if (completed && onTaskCompleted) {
                onTaskCompleted(completed);
              }
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              if (!controller.signal.aborted) {
                const failed = await taskStore.updateRecord(record.id, {
                  status: "failed",
                  completedAt: new Date().toISOString(),
                  currentStep: "Feilet",
                  error: errMsg,
                });
                await taskStore.appendEvent(record.id, `Feilet: ${errMsg}`);
                if (failed && onTaskCompleted) {
                  onTaskCompleted(failed);
                }
              }
            } finally {
              activeControllers.delete(record.id);
            }
          })();

          return {
            status: "delegated",
            task_id: record.id,
            message:
              "Arbeidsmauren har startet på oppgaven i bakgrunnen. Gi barnet en kort og koselig bekreftelse!",
          };
        }

        case "get_task_status": {
          const taskId = typeof args.task_id === "string" ? args.task_id.trim() : "";
          let record = null;
          if (taskId) {
            record = await taskStore.getRecord(taskId);
          } else {
            const recent = await taskStore.listRecent(5);
            record =
              recent.find((r) => r.status === "running" || r.status === "queued") ||
              recent[0] ||
              null;
          }

          if (!record) {
            return {
              status: "idle",
              message: "Arbeidsmauren har ingen aktive oppgaver akkurat nå.",
            };
          }

          return {
            status: record.status,
            task_id: record.id,
            task: record.task,
            current_step: record.currentStep || "Jobber med saken",
            result_summary: record.resultSummary || null,
          };
        }

        case "cancel_task": {
          const taskId = typeof args.task_id === "string" ? args.task_id.trim() : "";
          let active = null;
          if (taskId) {
            active = await taskStore.getRecord(taskId);
          } else {
            const recent = await taskStore.listRecent(5);
            active = recent.find((r) => r.status === "running" || r.status === "queued") || null;
          }

          if (!active) {
            return {
              status: "idle",
              message: "Ingen aktiv oppgave å avbryte.",
            };
          }

          const controller = activeControllers.get(active.id);
          if (controller) {
            controller.abort();
            activeControllers.delete(active.id);
          }
          await taskStore.updateRecord(active.id, {
            status: "cancelled",
            completedAt: new Date().toISOString(),
            currentStep: "Avbrutt",
          });
          return {
            status: "cancelled",
            task_id: active.id,
            message: `Oppgave ${active.id} hos Arbeidsmauren ble avbrutt.`,
          };
        }

        case "close_apps": {
          await execFileAsync(path.join(scriptsDir, "close-window.sh"));
          return {
            status: "ok",
            message: "Lukket åpne vinduer på skjermen.",
          };
        }

        default:
          return {
            status: "error",
            message: `Ukjent verktøy: ${name}`,
          };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        status: "error",
        message: `Feil ved kjøring av ${name}: ${errorMsg}`,
      };
    }
  }

  return {
    executeTool,
    taskStore,
  };
}
