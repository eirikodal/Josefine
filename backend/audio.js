// @ts-check
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

/** Stop even if a child is stuck while opening an audio device.
 * @param {import('node:child_process').ChildProcessWithoutNullStreams} child
 */
function terminate(child) {
  child.kill("SIGTERM");
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }, 1000);
  timer.unref();
  child.once("close", () => clearTimeout(timer));
}

/**
 * @fileoverview Lyd-I/O for Josefine via PipeWire / PulseAudio (ffmpeg / pw-play).
 * Skrevet i ren JavaScript med JSDoc.
 */

/**
 * Håndterer mikrofonopptak (16 kHz, 1 kanal, s16le PCM).
 * Bruker ffmpeg mot Pulse/PipeWire for universell støtte for alle mikrofoner (mono/stereo, resampling).
 */
export class AudioRecorder extends EventEmitter {
  constructor() {
    super();
    /** @type {import('node:child_process').ChildProcessWithoutNullStreams | null} */
    this.process = null;
    this.isRecording = false;
  }

  /**
   * Starter mikrofonopptak.
   */
  start() {
    if (this.isRecording) return;

    const inputDevice =
      process.env.JOSEFINE_AUDIO_INPUT ||
      process.env.JOSEFINE_AUDIO_DEVICE ||
      "default";

    // ffmpeg tar opp fra Pulse/PipeWire, mikser ned til 1 kanal (mono) og 16000 Hz s16le PCM
    const args = [
      "-nostdin",
      "-loglevel",
      "error",
      "-f",
      "pulse",
      "-i",
      inputDevice,
      "-f",
      "s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-",
    ];

    const child = spawn("ffmpeg", args);
    this.process = child;
    this.isRecording = true;
    this.emit("start", inputDevice);

    child.stdout.on("data", (chunk) => {
      if (this.process === child) this.emit("data", chunk);
    });

    child.stderr.on("data", (errData) => {
      if (this.process === child) this.emit("captureError", errData.toString().trim());
    });

    child.on("error", (error) => {
      if (this.process === child) this.emit("captureError", error.message);
    });

    child.on("close", (code) => {
      // An older child must never reset a newer recording.
      if (this.process !== child) return;
      this.process = null;
      this.isRecording = false;
      this.emit("stop", code);
    });
  }

  /**
   * Stopper opptaket.
   */
  stop() {
    const child = this.process;
    if (!child) return;
    this.process = null;
    this.isRecording = false;
    terminate(child);
    this.emit("stop", null);
  }
}

/**
 * Håndterer avspilling av Gemini Live-tale (24 kHz, 1 kanal, s16le PCM).
 */
export class AudioPlayer extends EventEmitter {
  constructor() {
    super();
    /** @type {import('node:child_process').ChildProcessWithoutNullStreams | null} */
    this.process = null;
    this.isPlaying = false;
  }

  /**
   * Sørger for at en aktiv avspillingsprosess kjører.
   * @private
   */
  _ensureProcess() {
    if (this.process && !this.process.killed && !this.process.stdin.writableEnded) return;
    this.stop();

    const child = spawn("pw-play", [
      "--raw",
      "--rate",
      "24000",
      "--channels",
      "1",
      "--format",
      "s16",
      "-",
    ]);

    this.process = child;
    this.isPlaying = true;
    this.emit("playStart");
    child.stdin.on("error", (error) => {
      if (this.process === child) this.emit("playbackError", error.message);
    });
    child.on("error", (error) => {
      if (this.process === child) this.emit("playbackError", error.message);
    });
    child.on("close", () => {
      if (this.process !== child) return;
      this.isPlaying = false;
      this.process = null;
      this.emit("playEnd");
    });
  }

  /**
   * Skriver en PCM-lydblokk til PipeWire for umiddelbar avspilling.
   * @param {Buffer} pcmChunk
   */
  playChunk(pcmChunk) {
    this._ensureProcess();
    if (this.process && this.process.stdin.writable) {
      this.process.stdin.write(pcmChunk);
    }
  }

  /** Finish queued audio and release the device after playback. */
  finish() {
    if (this.process && !this.process.stdin.writableEnded) this.process.stdin.end();
  }

  /**
   * Avslutter inneværende avspilling (avbryter umiddelbart ved avbrudd/interrupt).
   */
  stop() {
    const child = this.process;
    this.process = null;
    this.isPlaying = false;
    if (child) terminate(child);
  }
}
