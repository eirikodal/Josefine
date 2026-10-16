// @ts-check
import { EventEmitter } from "node:events";

/**
 * @fileoverview Klient for Gemini Multimodal Live API (WebSocket) med kontinuerlig PCM-lydstrømming
 * og Geminis innebygde server-side Voice Activity Detection (automaticActivityDetection).
 * Skrevet i ren JavaScript med JSDoc-typesikkerhet.
 */

/**
 * Konfigurasjon for Gemini Live sesjonen.
 * @typedef {Object} GeminiLiveConfig
 * @property {string} apiKey - Google Gemini API-nøkkel
 * @property {string} [model] - Modell-ID (standard: 'models/gemini-3.8-live')
 * @property {string} [voice] - Navn på stemme (standard: 'Aoede')
 * @property {string} [systemInstruction] - System-prompt for Josefine
 * @property {Array<any>} [tools] - Verktøyer / funksjonskall tilgjengelig for modellen
 * @property {number} [silenceDurationMs] - Naturlig pause i ms før Gemini svarer (standard: 900)
 */

/**
 * Verktøykall fra Gemini Live.
 * @typedef {Object} ToolCall
 * @property {string} id - Unik funksjonskall-ID
 * @property {string} name - Navn på funksjonen
 * @property {Record<string, any>} args - Argumenter gitt fra modellen
 */

export class GeminiLiveClient extends EventEmitter {
  /**
   * @param {GeminiLiveConfig} config
   */
  constructor(config) {
    super();
    this.apiKey = config.apiKey;
    this.model = config.model || "models/gemini-3.8-live";
    this.voice = config.voice || "Aoede";
    this.silenceDurationMs = config.silenceDurationMs ?? 900;
    this.systemInstruction =
      config.systemInstruction ||
      "Du er Josefine, en snill, leken og magisk bestevenn og assistent for barn på norsk. " +
        "Snakk alltid vennlig, varmt og barnevennlig med korte, engasjerende setninger. " +
        "Hvis barnet vil se noe (som et bilde av en hund eller en dinosaur), eller høre musikk, " +
        "bruker du verktøyene du har tilgjengelig.";
    this.tools = config.tools || [];

    /** @type {WebSocket | null} */
    this.ws = null;
    this.isReady = false;
    this.streamOpen = false;
  }

  /**
   * Åpner WebSocket-tilkoblingen til Gemini Live.
   * @returns {Promise<void>}
   */
  async connect() {
    if (!this.apiKey) {
      throw new Error("Mangler GEMINI_API_KEY for Gemini Live tilkobling.");
    }

    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this._sendSetup();
      };

      this.ws.onmessage = async (event) => {
        try {
          const raw =
            typeof event.data === "string"
              ? event.data
              : await event.data.text();
          const msg = JSON.parse(raw);
          this._handleMessage(msg, resolve);
        } catch (err) {
          this.emit("error", err);
        }
      };

      this.ws.onerror = (err) => {
        this.emit("error", err);
        reject(err);
      };

      this.ws.onclose = (event) => {
        this.isReady = false;
        this.streamOpen = false;
        if (!event.wasClean) reject(new Error(`Gemini lukket tilkoblingen (${event.code}).`));
        this.emit("close", event.code, event.reason);
      };
    });
  }

  /**
   * Sender oppstarts-konfigurasjonen (Setup) med Geminis innebygde server-VAD aktivert.
   * @private
   */
  _sendSetup() {
    if (!this.ws) return;

    /** @type {Record<string, any>} */
    const setupMsg = {
      setup: {
        model: this.model,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.voice,
              },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: this.systemInstruction }],
        },
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            silenceDurationMs: this.silenceDurationMs,
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    };

    if (this.tools && this.tools.length > 0) {
      setupMsg.setup.tools = [{ functionDeclarations: this.tools }];
    }

    this.ws.send(JSON.stringify(setupMsg));
  }

  /**
   * Behandler innkommende meldinger fra Gemini Live.
   * @private
   * @param {Record<string, any>} msg
   * @param {(value?: any) => void} resolveConnect
   */
  _handleMessage(msg, resolveConnect) {
    if (msg.setupComplete) {
      this.isReady = true;
      this.emit("ready");
      resolveConnect();
      return;
    }

    if (msg.serverContent) {
      const serverContent = msg.serverContent;

      if (serverContent.inputTranscription?.text) {
        this.emit("inputTranscript", serverContent.inputTranscription.text);
      }
      if (serverContent.outputTranscription?.text) {
        this.emit("outputTranscript", serverContent.outputTranscription.text);
      }

      if (serverContent.interrupted) {
        this.emit("interrupted");
      }

      if (serverContent.modelTurn && Array.isArray(serverContent.modelTurn.parts)) {
        for (const part of serverContent.modelTurn.parts) {
          if (part.text) {
            this.emit("text", part.text);
          }
          if (part.inlineData && part.inlineData.data) {
            const buffer = Buffer.from(part.inlineData.data, "base64");
            this.emit("audio", buffer, part.inlineData.mimeType);
          }
        }
      }

      if (serverContent.turnComplete) {
        this.emit("turnComplete");
      }
    }

    if (msg.toolCall && Array.isArray(msg.toolCall.functionCalls)) {
      for (const fc of msg.toolCall.functionCalls) {
        /** @type {ToolCall} */
        const toolCall = {
          id: fc.id,
          name: fc.name,
          args: fc.args || {},
        };
        this.emit("toolCall", toolCall);
      }
    }
  }

  /**
   * Sender en rå PCM-lydblokk (16kHz, 1-kanal, s16le) fra den kontinuerlige mikrofonen.
   * @param {Buffer} pcmChunk
   */
  sendAudioChunk(pcmChunk) {
    if (!this.ws || !this.isReady || this.ws.readyState !== WebSocket.OPEN) return false;
    if (pcmChunk.length === 0) return false;

    this.streamOpen = true;
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          audio: {
            mimeType: "audio/pcm;rate=16000",
            data: pcmChunk.toString("base64"),
          },
        },
      }),
    );
    return true;
  }

  /**
   * Signaliserer at mikrofon-strømmen er satt på pause / avsluttet (audioStreamEnd).
   */
  endAudioStream() {
    if (!this.ws || !this.isReady || !this.streamOpen || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    this.streamOpen = false;
    return true;
  }

  /**
   * Bakoverkompatibel alias for endAudioStream().
   */
  commitTurn() {
    return this.endAudioStream();
  }

  /**
   * Sender et tekstinnspill direkte til Gemini Live (bruker input).
   * @param {string} text
   */
  sendUserText(text) {
    if (!this.ws || !this.isReady) return;

    this.ws.send(
      JSON.stringify({
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [{ text }],
            },
          ],
          turnComplete: true,
        },
      }),
    );
  }

  /**
   * Sender resultatet av et verktøykall tilbake til Gemini Live.
   * @param {string} id - Funksjonskall-ID
   * @param {string} name - Funksjonsnavn
   * @param {Record<string, any>} response - Svarobjekt
   */
  sendToolResponse(id, name, response) {
    if (!this.ws || !this.isReady) return;

    this.ws.send(
      JSON.stringify({
        toolResponse: {
          functionResponses: [
            {
              id,
              name,
              response,
            },
          ],
        },
      }),
    );
  }

  /**
   * Lukker tilkoblingen.
   */
  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isReady = false;
      this.streamOpen = false;
    }
  }
}
