// @ts-check
import assert from "node:assert/strict";
import test from "node:test";
import { GeminiLiveClient } from "./geminiLive.js";

function createReadyClient() {
  const client = new GeminiLiveClient({ apiKey: "test-key" });
  /** @type {any[]} */
  const sent = [];
  client.ws = /** @type {any} */ ({
    readyState: WebSocket.OPEN,
    send(payload) {
      sent.push(JSON.parse(payload));
    },
  });
  return { client, sent };
}

test("continuous conversation enables Gemini automaticActivityDetection and requests both transcripts", () => {
  const { client, sent } = createReadyClient();
  client._sendSetup();

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].setup.realtimeInputConfig, {
    automaticActivityDetection: {
      disabled: false,
      silenceDurationMs: 900,
    },
  });
  assert.deepEqual(sent[0].setup.inputAudioTranscription, {});
  assert.deepEqual(sent[0].setup.outputAudioTranscription, {});
});

test("PCM is streamed via realtimeInput.audio and closed with audioStreamEnd, never an empty clientContent turn", () => {
  const { client, sent } = createReadyClient();
  client._handleMessage({ setupComplete: {} }, () => {});

  const pcm = Buffer.from([1, 0, 2, 0]);
  assert.equal(client.sendAudioChunk(pcm), true);
  assert.equal(client.sendAudioChunk(pcm), true);
  assert.equal(client.endAudioStream(), true);
  assert.equal(client.endAudioStream(), false);

  assert.deepEqual(sent, [
    {
      realtimeInput: {
        audio: {
          mimeType: "audio/pcm;rate=16000",
          data: pcm.toString("base64"),
        },
      },
    },
    {
      realtimeInput: {
        audio: {
          mimeType: "audio/pcm;rate=16000",
          data: pcm.toString("base64"),
        },
      },
    },
    { realtimeInput: { audioStreamEnd: true } },
  ]);
  assert.equal(sent.some((msg) => "clientContent" in msg), false);
});

test("empty/unready audio does not open a stream", () => {
  const { client, sent } = createReadyClient();
  assert.equal(client.sendAudioChunk(Buffer.from([1, 0])), false);

  client._handleMessage({ setupComplete: {} }, () => {});
  assert.equal(client.sendAudioChunk(Buffer.alloc(0)), false);
  assert.equal(client.endAudioStream(), false);
  assert.deepEqual(sent, []);
});

test("server input/output transcripts are emitted independently of audio", () => {
  const { client } = createReadyClient();
  /** @type {string[]} */
  const inputs = [];
  /** @type {string[]} */
  const outputs = [];
  client.on("inputTranscript", (text) => inputs.push(text));
  client.on("outputTranscript", (text) => outputs.push(text));

  client._handleMessage(
    {
      serverContent: {
        inputTranscription: { text: "Hei Josefine" },
        outputTranscription: { text: "Hei på deg!" },
      },
    },
    () => {},
  );

  assert.deepEqual(inputs, ["Hei Josefine"]);
  assert.deepEqual(outputs, ["Hei på deg!"]);
});
