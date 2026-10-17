// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildJosefineSystemPrompt, discoverJosefineSkills } from "./systemPrompt.js";
import { createAgentDispatcher, JOSEFINE_TOOLS } from "./agentDispatcher.js";
import { TaskStore } from "./taskStore.js";
import { createReflectionManager } from "./reflection.js";
import { isNightSleepTime } from "./nightSchedule.js";
import { ensureJosefineHome, saveChildProfile, computeChildInfo, loadChildProfile } from "./homeManager.js";

const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("ensureJosefineHome, saveChildProfile og buildJosefineSystemPrompt setter opp ~/JosefineHome med JOSEFINE.md, fødselsår og Skills/", async () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "josefine-home-test-"));
  try {
    ensureJosefineHome(REPO_DIR, tmpHome);
    const info = saveChildProfile(
      { name: "Nora", age: 6 },
      tmpHome,
      new Date("2026-04-20T12:00:00Z"),
    );

    assert.equal(info.name, "Nora");
    assert.equal(info.age, 6);
    assert.equal(info.birthYear, 2020);
    assert.ok(fs.existsSync(path.join(tmpHome, "JOSEFINE.md")));
    assert.ok(fs.existsSync(path.join(tmpHome, "AGENTS.md")));

    // Sjekk at alderen automatisk øker med 1 år i 2027
    const nextYearInfo = computeChildInfo(
      loadChildProfile(tmpHome),
      new Date("2027-04-20T12:00:00Z"),
    );
    assert.equal(nextYearInfo?.age, 7);

    // Legg til et Wiki-notat
    fs.writeFileSync(
      path.join(tmpHome, "Wiki", "interesser.md"),
      "Nora elsker dinosaurer og har bursdag i mai.\n",
      "utf8",
    );

    const prompt = await buildJosefineSystemPrompt(tmpHome, new Date("2026-04-20T12:00:00Z"));
    assert.ok(prompt.includes("Du er **Josefine**, Nora"));
    assert.ok(prompt.includes("## Barnets nåværende alder"));
    assert.ok(prompt.includes("## Kunnskapsbase (Wiki)"));
    assert.ok(prompt.includes("Nora elsker dinosaurer"));
    assert.ok(prompt.includes("## Arbeidsmaurens spesialferdigheter (Skills)"));

    const skills = await discoverJosefineSkills(tmpHome);
    const names = skills.map((s) => s.name);
    assert.ok(names.includes("magisk-tavle"));
    assert.ok(names.includes("spotify"));
    assert.ok(names.includes("vis-bilde"));
    assert.ok(names.includes("skjerm-kontroll"));
    assert.ok(names.includes("browser-tools"));
    assert.ok(names.includes("brave-search"));
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test("createAgentDispatcher håndterer delegate_task, get_task_status og sender rapport når Arbeidsmauren er ferdig", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "josefine-tasks-"));
  try {
    const taskStore = new TaskStore(tmpDir);
    /** @type {any[]} */
    const completedRecords = [];
    /** @type {string[]} */
    const progressSteps = [];

    const dispatcher = createAgentDispatcher({
      repoDir: REPO_DIR,
      homeDir: tmpDir,
      taskStore,
      onProgress: (_id, step) => progressSteps.push(step),
      onTaskCompleted: (rec) => completedRecords.push(rec),
      workerRunner: async ({ task, onProgress }) => {
        if (onProgress) onProgress("Lager magisk HTML-tavle");
        await new Promise((r) => setTimeout(r, 25));
        return {
          summary: `Viste fram oppgaven: ${task}`,
        };
      },
    });

    assert.ok(JOSEFINE_TOOLS.some((t) => t.name === "delegate_task"));

    const delegated = await dispatcher.executeTool("delegate_task", {
      task: "Lag et faktakort om dinosaurer",
      notify_on_complete: true,
    });

    assert.equal(delegated.status, "delegated");
    assert.ok(delegated.task_id);

    await new Promise((r) => setTimeout(r, 60));

    assert.equal(completedRecords.length, 1);
    assert.equal(completedRecords[0].status, "completed");
    assert.match(completedRecords[0].resultSummary, /Lag et faktakort om dinosaurer/);
    assert.ok(progressSteps.includes("Lager magisk HTML-tavle"));

    const statusRes = await dispatcher.executeTool("get_task_status", {
      task_id: delegated.task_id,
    });
    assert.equal(statusRes.status, "completed");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("createAgentDispatcher kan avbryte en pågående oppgave hos Arbeidsmauren med cancel_task", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "josefine-cancel-"));
  try {
    const taskStore = new TaskStore(tmpDir);

    const dispatcher = createAgentDispatcher({
      repoDir: REPO_DIR,
      homeDir: tmpDir,
      taskStore,
      workerRunner: async ({ signal }) => {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 5000);
          if (signal) {
            signal.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(new Error("Aborted"));
            });
          }
        });
        return { summary: "Aldri ferdig" };
      },
    });

    const delegated = await dispatcher.executeTool("delegate_task", {
      task: "Lang oppgave",
    });

    const cancelled = await dispatcher.executeTool("cancel_task", {
      task_id: delegated.task_id,
    });
    assert.equal(cancelled.status, "cancelled");

    const statusAfter = await dispatcher.executeTool("get_task_status", {
      task_id: delegated.task_id,
    });
    assert.equal(statusAfter.status, "cancelled");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("createReflectionManager logger samtale og kjører stille refleksjon via Arbeidsmauren i ~/JosefineHome etter samtalen", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "josefine-reflect-"));
  try {
    saveChildProfile({ name: "Nora", age: 6 }, tmpDir);
    /** @type {string} */
    let reflectedTask = "";
    const reflection = createReflectionManager({
      homeDir: tmpDir,
      logDir: tmpDir,
      idleMs: 60_000,
      workerRunner: async ({ task }) => {
        reflectedTask = task;
        return { summary: "Oppdaterte Wiki med at Nora liker enhjørninger." };
      },
    });

    reflection.recordTurn("user", "Jeg elsker rosa enhjørninger!");
    reflection.recordTurn("model", "Åå, rosa enhjørninger er kjempefine!");

    const didRun = await reflection.runReflectionNow();
    reflection.stop();

    assert.equal(didRun, true);
    assert.match(reflectedTask, /STILLE REFLEKSJON ETTER SAMTALE MED NORA/);
    assert.match(reflectedTask, /Jeg elsker rosa enhjørninger!/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("createAgentDispatcher støtter steer_task på kjørende oppgave, parallelle oppgaver og end_conversation", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "josefine-steer-"));
  try {
    const taskStore = new TaskStore(tmpDir);
    /** @type {string[]} */
    const steeredMessages = [];
    /** @type {number[]} */
    const activeCounts = [];
    let endedConversation = false;

    const dispatcher = createAgentDispatcher({
      repoDir: REPO_DIR,
      homeDir: tmpDir,
      taskStore,
      onActiveCountChange: (count) => activeCounts.push(count),
      onEndConversation: () => {
        endedConversation = true;
      },
      workerRunner: async ({ task, onSessionReady }) => {
        if (onSessionReady) {
          onSessionReady({
            steer: async (msg) => {
              steeredMessages.push(msg);
            },
          });
        }
        await new Promise((r) => setTimeout(r, 50));
        return { summary: `Ferdig med: ${task}` };
      },
    });

    const t1 = await dispatcher.executeTool("delegate_task", { task: "Lag hunde-nettside" });
    const t2 = await dispatcher.executeTool("delegate_task", { task: "Spill musikk" });
    assert.equal(dispatcher.getActiveCount(), 2);

    const steerRes = await dispatcher.executeTool("steer_task", {
      task_id: t1.task_id,
      instruction: "Ta med en mops også!",
    });
    assert.equal(steerRes.status, "steered");
    assert.equal(steeredMessages.length, 1);
    assert.match(steeredMessages[0], /Ta med en mops også!/);

    const endRes = await dispatcher.executeTool("end_conversation", {});
    assert.equal(endRes.status, "ending");
    assert.equal(endedConversation, true);

    await new Promise((r) => setTimeout(r, 80));
    assert.equal(dispatcher.getActiveCount(), 0);
    assert.ok(activeCounts.includes(2));
    assert.equal(activeCounts.at(-1), 0);
    assert.ok(t2.task_id);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("isNightSleepTime er true mellom 20:00 og 06:30 og false på dagtid", () => {
  assert.equal(isNightSleepTime(new Date("2026-04-20T20:15:00")), true);
  assert.equal(isNightSleepTime(new Date("2026-04-20T05:45:00")), true);
  assert.equal(isNightSleepTime(new Date("2026-04-20T06:35:00")), false);
  assert.equal(isNightSleepTime(new Date("2026-04-20T14:00:00")), false);
});
