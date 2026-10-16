// @ts-check

/**
 * @fileoverview Lokal Voice Activity Detection (VAD) og taletur-detektor for 16 kHz s16le PCM.
 * Lar brukeren føre en naturlig, håndfri samtale etter å ha trykket "Snakk" én gang:
 *  - Samler opp en pre-roll-buffer (~400 ms) før tale oppdages slik at første stavelse aldri kuttes.
 *  - Oppdager når brukeren begynner å snakke (peak/RMS over terskel).
 *  - Oppdager når brukeren tar en naturlig pause (~1.2 s stillhet etter tale) -> kaller onSpeechEnd().
 *  - Oppdager når det har vært helt stille lenge nok (~12 s uten tale) -> kaller onSilenceTimeout().
 */

const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const BYTES_PER_MS = (SAMPLE_RATE * BYTES_PER_SAMPLE) / 1000; // 32 bytes/ms

/**
 * Beregner peak og RMS for en 16-bit signed little-endian PCM-buffer.
 * @param {Buffer} chunk
 * @returns {{ peak: number, rms: number }}
 */
export function analyzePcmChunk(chunk) {
  const sampleCount = Math.floor(chunk.length / 2);
  if (sampleCount === 0) return { peak: 0, rms: 0 };

  let peak = 0;
  let sumSquares = 0;
  for (let i = 0; i + 1 < chunk.length; i += 2) {
    const sample = Math.abs(chunk.readInt16LE(i));
    if (sample > peak) peak = sample;
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / sampleCount);
  return { peak, rms };
}

export class VoiceTurnDetector {
  /**
   * @param {Object} [options]
   * @param {number} [options.speechPeakThreshold] - Peak-terskel (0..32767) for å trigge talestart (standard: 1100)
   * @param {number} [options.speechRmsThreshold] - RMS-terskel for å trigge talestart (standard: 320)
   * @param {number} [options.continuePeakThreshold] - Lavere terskel (hysterese) for å holde talen aktiv (standard: 750)
   * @param {number} [options.continueRmsThreshold] - Lavere RMS-terskel for å holde talen aktiv (standard: 220)
   * @param {number} [options.minSpeechMs] - Minimum varighet av tale før en pause avslutter turen (standard: 220 ms)
   * @param {number} [options.endOfSpeechSilenceMs] - Varighet av naturlig pause som avslutter turen (standard: 1200 ms)
   * @param {number} [options.noSpeechTimeoutMs] - Maks tid uten tale før samtalen slås av (standard: 12000 ms)
   * @param {number} [options.preRollMs] - Hvor mye lyd før talestart som tas med (standard: 400 ms)
   * @param {(chunk: Buffer) => void} [options.onAudioToSend] - Kalles for hver PCM-chunk som skal sendes til Gemini
   * @param {() => void} [options.onSpeechStart] - Kalles når brukeren begynner å snakke
   * @param {() => void} [options.onSpeechEnd] - Kalles når brukeren har snakket og tatt en naturlig pause
   * @param {() => void} [options.onSilenceTimeout] - Kalles når det har vært stille i noSpeechTimeoutMs uten tale
   */
  constructor(options = {}) {
    this.speechPeakThreshold =
      options.speechPeakThreshold ??
      parseInt(process.env.JOSEFINE_VAD_PEAK_THRESHOLD || "1100", 10);
    this.speechRmsThreshold =
      options.speechRmsThreshold ??
      parseInt(process.env.JOSEFINE_VAD_RMS_THRESHOLD || "320", 10);
    this.continuePeakThreshold =
      options.continuePeakThreshold ?? Math.round(this.speechPeakThreshold * 0.68);
    this.continueRmsThreshold =
      options.continueRmsThreshold ?? Math.round(this.speechRmsThreshold * 0.68);

    this.minSpeechMs = options.minSpeechMs ?? 220;
    this.endOfSpeechSilenceMs =
      options.endOfSpeechSilenceMs ??
      parseInt(process.env.JOSEFINE_VAD_SILENCE_MS || "1200", 10);
    this.noSpeechTimeoutMs =
      options.noSpeechTimeoutMs ??
      parseInt(process.env.JOSEFINE_VAD_IDLE_TIMEOUT_MS || "12000", 10);
    this.preRollBytes = (options.preRollMs ?? 400) * BYTES_PER_MS;

    this.onAudioToSend = options.onAudioToSend || (() => {});
    this.onSpeechStart = options.onSpeechStart || (() => {});
    this.onSpeechEnd = options.onSpeechEnd || (() => {});
    this.onSilenceTimeout = options.onSilenceTimeout || (() => {});

    this.reset();
  }

  /**
   * @param {number} [customNoSpeechTimeoutMs]
   */
  reset(customNoSpeechTimeoutMs) {
    /** @type {Buffer[]} */
    this.preRollChunks = [];
    this.preRollTotalBytes = 0;
    this.hasDetectedSpeech = false;
    this.completed = false;
    this.speechBytes = 0;
    this.silenceAfterSpeechBytes = 0;
    this.totalBytesProcessed = 0;
    this.activeNoSpeechTimeoutMs = customNoSpeechTimeoutMs ?? this.noSpeechTimeoutMs;
  }

  /**
   * Prosesserer en ny PCM-chunk fra mikrofonen.
   * @param {Buffer} chunk
   */
  processChunk(chunk) {
    if (this.completed || chunk.length === 0) return;

    this.totalBytesProcessed += chunk.length;
    const { peak, rms } = analyzePcmChunk(chunk);

    if (!this.hasDetectedSpeech) {
      const isSpeech =
        peak >= this.speechPeakThreshold || rms >= this.speechRmsThreshold;

      if (isSpeech) {
        this.hasDetectedSpeech = true;
        this.speechBytes = chunk.length;
        this.silenceAfterSpeechBytes = 0;
        this.onSpeechStart();

        // Send pre-roll-bufferen først slik at starten av ordet ikke kuttes
        for (const pre of this.preRollChunks) {
          this.onAudioToSend(pre);
        }
        this.preRollChunks = [];
        this.preRollTotalBytes = 0;
        this.onAudioToSend(chunk);
        return;
      }

      // Oppdater rullerende pre-roll-buffer
      this.preRollChunks.push(chunk);
      this.preRollTotalBytes += chunk.length;
      while (
        this.preRollChunks.length > 1 &&
        this.preRollTotalBytes - this.preRollChunks[0].length >= this.preRollBytes
      ) {
        const removed = this.preRollChunks.shift();
        if (removed) this.preRollTotalBytes -= removed.length;
      }

      // Sjekk om det har vært stille i hele noSpeechTimeoutMs
      const elapsedMs = this.totalBytesProcessed / BYTES_PER_MS;
      if (this.activeNoSpeechTimeoutMs > 0 && elapsedMs >= this.activeNoSpeechTimeoutMs) {
        this.completed = true;
        this.onSilenceTimeout();
      }
      return;
    }

    // Vi er inne i en taletur: send alltid lyden til Gemini
    this.onAudioToSend(chunk);

    const isContinuingSpeech =
      peak >= this.continuePeakThreshold || rms >= this.continueRmsThreshold;

    if (isContinuingSpeech) {
      this.speechBytes += chunk.length;
      this.silenceAfterSpeechBytes = 0;
    } else {
      this.silenceAfterSpeechBytes += chunk.length;
      const speechDurationMs = this.speechBytes / BYTES_PER_MS;
      const silenceDurationMs = this.silenceAfterSpeechBytes / BYTES_PER_MS;

      if (
        speechDurationMs >= this.minSpeechMs &&
        silenceDurationMs >= this.endOfSpeechSilenceMs
      ) {
        this.completed = true;
        this.onSpeechEnd();
      } else if (
        speechDurationMs < this.minSpeechMs &&
        silenceDurationMs >= this.endOfSpeechSilenceMs * 2
      ) {
        // Det var bare et kort klikk/dunk (< minSpeechMs) etterfulgt av lang stillhet
        this.completed = true;
        this.onSpeechEnd();
      }
    }
  }
}
