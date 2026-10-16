// @ts-check
import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";

/**
 * @fileoverview Oppgavelager for Arbeidsmaurens bakgrunnsjobber i Josefine.
 */

/**
 * @typedef {'queued' | 'running' | 'completed' | 'failed' | 'cancelled'} TaskStatus
 */

/**
 * @typedef {Object} TaskRecord
 * @property {string} id
 * @property {string} task
 * @property {TaskStatus} status
 * @property {boolean} notifyOnComplete
 * @property {string} createdAt
 * @property {string} [startedAt]
 * @property {string} [completedAt]
 * @property {string} [currentStep]
 * @property {string} [resultSummary]
 * @property {string} [error]
 */

export class TaskStore {
  /**
   * @param {string} [rootDir]
   */
  constructor(rootDir = "/tmp/josefine-tasks") {
    this.rootDir = rootDir;
    /** @type {Map<string, Promise<any>>} */
    this.locks = new Map();
  }

  /**
   * @param {{ task: string, notifyOnComplete?: boolean }} params
   * @returns {Promise<TaskRecord>}
   */
  async createTask(params) {
    const id = `task_${Date.now()}_${randomBytes(3).toString("hex")}`;
    const dir = path.join(this.rootDir, id);
    await mkdir(dir, { recursive: true });

    /** @type {TaskRecord} */
    const record = {
      id,
      task: params.task,
      status: "queued",
      notifyOnComplete: params.notifyOnComplete ?? true,
      createdAt: new Date().toISOString(),
      currentStep: "Venter på at Arbeidsmauren skal starte...",
    };

    await this.saveRecord(record);
    await this.appendEvent(id, `Oppgave opprettet: ${params.task}`);
    return record;
  }

  /**
   * @param {TaskRecord} record
   */
  async saveRecord(record) {
    const dir = path.join(this.rootDir, record.id);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, "task.json");
    await writeFile(file, JSON.stringify(record, null, 2) + "\n", "utf8");
  }

  /**
   * @param {string} id
   * @param {Partial<TaskRecord>} patch
   * @returns {Promise<TaskRecord | null>}
   */
  async updateRecord(id, patch) {
    const prev = this.locks.get(id) || Promise.resolve();
    const next = prev.then(async () => {
      const existing = await this.getRecord(id);
      if (!existing) return null;
      const updated = { ...existing, ...patch };
      await this.saveRecord(updated);
      return updated;
    });
    this.locks.set(id, next.catch(() => {}));
    return next;
  }

  /**
   * @param {string} id
   * @returns {Promise<TaskRecord | null>}
   */
  async getRecord(id) {
    try {
      const raw = await readFile(path.join(this.rootDir, id, "task.json"), "utf8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * @param {string} id
   * @param {string} message
   */
  async appendEvent(id, message) {
    try {
      const dir = path.join(this.rootDir, id);
      await mkdir(dir, { recursive: true });
      const line = `[${new Date().toISOString()}] ${message}\n`;
      await appendFile(path.join(dir, "events.log"), line, "utf8");
    } catch {
      // Ignorer loggfeil
    }
  }

  /**
   * @param {string} id
   * @param {number} [maxLines]
   * @returns {Promise<string[]>}
   */
  async getRecentEvents(id, maxLines = 8) {
    try {
      const raw = await readFile(path.join(this.rootDir, id, "events.log"), "utf8");
      return raw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(-maxLines);
    } catch {
      return [];
    }
  }

  /**
   * Returnerer alle oppgaver sortert nyeste først.
   * @param {number} [limit]
   * @returns {Promise<TaskRecord[]>}
   */
  async listRecent(limit = 10) {
    try {
      const entries = await readdir(this.rootDir, { withFileTypes: true });
      const dirs = entries
        .filter((e) => e.isDirectory() && e.name.startsWith("task_"))
        .map((e) => e.name)
        .sort()
        .reverse()
        .slice(0, limit);

      /** @type {TaskRecord[]} */
      const records = [];
      for (const dir of dirs) {
        const rec = await this.getRecord(dir);
        if (rec) records.push(rec);
      }
      return records;
    } catch {
      return [];
    }
  }
}
