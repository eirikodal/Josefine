// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { VoiceTurnDetector, analyzePcmChunk } from "./vad.js";

/**
 * Lager en 16 kHz s16le PCM-buffer med gitt varighet i ms og amplitude.
 * @param {number} durationMs
 * @param {number} amplitude
 */
function makePcmChunk(durationMs, amplitude) {
  const sampleCount = Math.floor((16000 * durationMs) / 1000);
  const buf = Buffer.alloc(sampleCount * 2);
  for (let i = 0; i < sampleCount; i++) {
    // Enkel firkant/alternerende bølge med gitt amplitude
    const val = i % 2 === 0 ? amplitude : -amplitude;
    buf.writeInt16LE(val, i * 2);
  }
  return buf;
}

test("analyzePcmChunk beregner peak og rms riktig", () => {
  const silent = makePcmChunk(100, 0);
  assert.deepEqual(analyzePcmChunk(silent), { peak: 0, rms: 0 });

  const loud = makePcmChunk(100, 4000);
  const stats = analyzePcmChunk(loud);
  assert.equal(stats.peak, 4000);
  assert.equal(stats.rms, 4000);
});

test("VoiceTurnDetector sender med pre-roll og avslutter turen automatisk ved naturlig pause", () => {
  /** @type {Buffer[]} */
  const sentChunks = [];
  let speechStarted = 0;
  let speechEnded = 0;
  let silenceTimedOut = 0;

  const vad = new VoiceTurnDetector({
    speechPeakThreshold: 1100,
    minSpeechMs: 200,
    endOfSpeechSilenceMs: 1200,
    noSpeechTimeoutMs: 12000,
    preRollMs: 300,
    onAudioToSend: (c) => sentChunks.push(c),
    onSpeechStart: () => speechStarted++,
    onSpeechEnd: () => speechEnded++,
    onSilenceTimeout: () => silenceTimedOut++,
  });

  // 1. 500 ms med lav bakgrunnsstøy (5 x 100 ms): kun siste ~300 ms skal ligge i pre-roll
  for (let i = 0; i < 5; i++) {
    vad.processChunk(makePcmChunk(100, 120));
  }
  assert.equal(speechStarted, 0);
  assert.equal(sentChunks.length, 0);

  // 2. Brukeren snakker i 600 ms (6 x 100 ms med amplitude 3500)
  for (let i = 0; i < 6; i++) {
    vad.processChunk(makePcmChunk(100, 3500));
  }
  assert.equal(speechStarted, 1);
  assert.equal(speechEnded, 0);
  // 3 pre-roll chunks (300 ms) + 6 tale-chunks = 9 chunks sendt
  assert.equal(sentChunks.length, 9);

  // 3. Brukeren tar en naturlig pause på 1200 ms (12 x 100 ms med lav bakgrunnsstøy)
  for (let i = 0; i < 12; i++) {
    vad.processChunk(makePcmChunk(100, 100));
  }
  assert.equal(speechEnded, 1);
  assert.equal(silenceTimedOut, 0);
});

test("VoiceTurnDetector avslutter samtalen (onSilenceTimeout) når det er stille lenge nok uten tale", () => {
  let speechEnded = 0;
  let silenceTimedOut = 0;

  const vad = new VoiceTurnDetector({
    noSpeechTimeoutMs: 2000,
    onSpeechEnd: () => speechEnded++,
    onSilenceTimeout: () => silenceTimedOut++,
  });

  // 20 x 100 ms = 2000 ms med kun lav bakgrunnsstøy
  for (let i = 0; i < 20; i++) {
    vad.processChunk(makePcmChunk(100, 80));
  }

  assert.equal(speechEnded, 0);
  assert.equal(silenceTimedOut, 1);
});
