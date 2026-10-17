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
 * Støtter både flere parallelle bakgrunnsoppgaver og direkte styring (steer_task)
 * av pågående oppgaver mens barnet prater!
 */

export const JOSEFINE_TOOLS = [
  {
    name: "delegate_task",
    description:
      "Delegerer en ny oppgave til Arbeidsmauren (din autonome bakgrunnsagent som styrer venstresiden av skjermen, musikk og innstillinger). " +
      "Du kan gjerne starte flere oppgaver i bakgrunnen samtidig! " +
      "Returnerer umiddelbart slik at du kan fortsette å prate mens Arbeidsmauren jobber.",
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
    name: "steer_task",
    description:
      "Sender en tilleggsbeskjed eller endring direkte til en oppgave Arbeidsmauren allerede holder på med akkurat nå " +
      "(f.eks. hvis barnet sier 'Ta med en mops også!' eller 'Gjør bakgrunnen rosa!' mens Arbeidsmauren lager en nettside).",
    parameters: {
      type: "OBJECT",
      properties: {
        instruction: {
          type: "STRING",
          description: "Hva Arbeidsmauren skal endre eller legge til i oppgaven den jobber med nå.",
        },
        task_id: {
          type: "STRING",
          description: "Valgfri oppgave-ID (hvis utelatt, styres den nyeste aktive oppgaven).",
        },
      },
      required: ["instruction"],
    },
  },
  {
    name: "get_task_status",
    description:
      "Sjekker status på alle aktive og nylige oppgaver hos Arbeidsmauren. Bruk dette hvis barnet spør 'Kommer det snart?' eller 'Hva gjør Arbeidsmauren nå?'.",
    parameters: {
      type: "OBJECT",
      properties: {
        task_id: {
          type: "STRING",
          description: "Valgfri oppgave-ID. Hvis utelatt, vises alle aktive og nylige oppgaver.",
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
          description: "Valgfri oppgave-ID som skal avbrytes (avbryter siste aktive oppgave hvis utelatt).",
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
  {
    name: "end_conversation",
    description:
      "Avslutter samtalen og skrur av mikrofonen når barnet eller en voksen sier 'Ha det', 'Takk, det var alt', 'Vi har ikke noe mer nå', 'Snakkes senere' eller tydelig ønsker å avslutte samtalen. Si en kort, varm avskjed samtidig som du kaller dette verktøyet.",
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
 * @param {(activeCount: number) => void} [options.onActiveCountChange] - Kalles når antall aktive bakgrunnsoppgaver endres
 * @param {() => void} [options.onEndConversation] - Kalles når Josefine bruker end_conversation-verktøyet
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
    onActiveCountChange,
    onEndConversation,
  } = options;

  const scriptsDir = path.join(repoDir, "scripts");
  /** @type {Map<string, AbortController>} */
  const activeControllers = new Map();
  /** @type {Map<string, { steer: (text: string) => Promise<any> }>} */
  const activeSessions = new Map();

  function notifyActiveCount() {
    if (onActiveCountChange) {
      onActiveCountChange(activeControllers.size);
    }
  }

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
          notifyActiveCount();

          // Start Arbeidsmauren asynkront i bakgrunnen med homeDir som arbeidsmappe
          (async () => {
            await taskStore.updateRecord(record.id, {
              status: "running",
              startedAt: new Date().toISOString(),
              currentStep: "Jobber i bakgrunnen...",
            });

            try {
              const { summary } = await workerRunner({
                taskId: record.id,
                task: taskText,
                homeDir,
                apiKey,
                signal: controller.signal,
                onSessionReady: (session) => {
                  activeSessions.set(record.id, session);
                },
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
              activeSessions.delete(record.id);
              notifyActiveCount();
            }
          })();

          return {
            status: "delegated",
            task_id: record.id,
            active_tasks: activeControllers.size,
            message:
              "Arbeidsmauren har startet på oppgaven i bakgrunnen. Gi barnet en kort og koselig bekreftelse!",
          };
        }

        case "steer_task": {
          const instruction = String(args.instruction || "").trim();
          if (!instruction) {
            return { status: "error", message: "Mangler instruksjon (instruction)." };
          }
          const requestedId = typeof args.task_id === "string" ? args.task_id.trim() : "";
          const recent = await taskStore.listRecent(10);
          const runningTasks = recent.filter((r) => r.status === "running");
          const target =
            (requestedId && runningTasks.find((r) => r.id === requestedId)) ||
            runningTasks[0] ||
            null;

          if (!target) {
            // Ingen aktiv oppgave kjører lenger -> start som en vanlig ny oppgave!
            return executeTool("delegate_task", { task: instruction, notify_on_complete: true });
          }

          const session = activeSessions.get(target.id);
          if (session && typeof session.steer === "function") {
            await session.steer(`Tilleggsønske fra barnet mens du jobber: ${instruction}`);
            await taskStore.appendEvent(target.id, `Styrt med tilleggsønske: ${instruction}`);
            return {
              status: "steered",
              task_id: target.id,
              message: `Sendte tilleggsønsket direkte til Arbeidsmauren på oppgave ${target.id}.`,
            };
          }

          return executeTool("delegate_task", { task: instruction, notify_on_complete: true });
        }

        case "get_task_status": {
          const taskId = typeof args.task_id === "string" ? args.task_id.trim() : "";
          if (taskId) {
            const record = await taskStore.getRecord(taskId);
            if (!record) {
              return { status: "not_found", message: `Fant ikke oppgave ${taskId}.` };
            }
            return {
              status: record.status,
              task_id: record.id,
              task: record.task,
              current_step: record.currentStep || "Jobber i bakgrunnen",
              result_summary: record.resultSummary || null,
            };
          }

          const recent = await taskStore.listRecent(6);
          const active = recent.filter((r) => r.status === "running" || r.status === "queued");
          if (active.length === 0 && recent.length === 0) {
            return {
              status: "idle",
              active_count: 0,
              message: "Arbeidsmauren har ingen aktive oppgaver akkurat nå.",
            };
          }

          return {
            status: active.length > 0 ? "running" : recent[0].status,
            active_count: active.length,
            task_id: (active[0] || recent[0]).id,
            task: (active[0] || recent[0]).task,
            current_step: (active[0] || recent[0]).currentStep || "Jobber i bakgrunnen",
            result_summary: (active[0] || recent[0]).resultSummary || null,
            tasks: recent.map((r) => ({
              task_id: r.id,
              status: r.status,
              task: r.task,
              current_step: r.currentStep,
              result_summary: r.resultSummary || null,
            })),
          };
        }

        case "cancel_task": {
          const taskId = typeof args.task_id === "string" ? args.task_id.trim() : "";
          let active = null;
          if (taskId) {
            active = await taskStore.getRecord(taskId);
          } else {
            const recent = await taskStore.listRecent(10);
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
            activeSessions.delete(active.id);
            notifyActiveCount();
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

        case "end_conversation": {
          if (onEndConversation) {
            onEndConversation();
          }
          return {
            status: "ending",
            message:
              "Samtalen avsluttes og mikrofonen skrus av så snart du har sagt en kort og varm avskjed.",
          };
        }

        default:
          return { status: "error", message: `Ukjent verktøy: ${name}` };
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return { status: "error", message: errMsg };
    }
  }

  return {
    executeTool,
    taskStore,
    getActiveCount: () => activeControllers.size,
  };
}
