// @ts-check

/**
 * @fileoverview Tilstands- og logikkmotor for Josefine AI-grensesnittet.
 * Skrevet i ren JavaScript med JSDoc for full typesikkerhet og IDE-støtte.
 */

/**
 * Tilstander Josefine kan befinne seg i.
 * @typedef {'idle' | 'listening' | 'thinking' | 'speaking'} JosefineState
 */

/**
 * Hendelsestype for asynkrone oppgaver som sendes videre til Pi Coding Agent / bakgrunns-LLM.
 * @typedef {Object} AgentTask
 * @property {string} id - Unik oppgave-ID
 * @property {'image_search' | 'music_playback' | 'window_control' | 'generic'} type - Type oppgave
 * @property {string} prompt - Naturlig språk eller instruksjon fra Gemini Live
 * @property {Record<string, any>} [params] - Ekstra parametere for verktøykall
 */

/**
 * UI-tekster og visuelle innstillinger per tilstand.
 * @typedef {Object} StateDisplayConfig
 * @property {string} buttonText - Tekst på mikrofonknappen
 * @property {string} buttonSubtext - Hjelpetekst under knappen
 * @property {string} statusText - Hovedtekst/hilsen øverst
 * @property {string} auraColorCenter - Senterfarge for aura-gradienten
 * @property {string} auraColorOuter - Ytterfarge for aura-gradienten
 * @property {number} auraPulseSpeedMs - Hastighet på pulsering i millisekunder
 * @property {boolean} isMicActive - Hvorvidt mikrofonen lytter/tar opp lyd
 */

/**
 * Ordbok over visuelle tilstander og tilhørende tekster.
 * @type {Record<JosefineState, StateDisplayConfig>}
 */
const STATE_CONFIGS = {
  idle: {
    buttonText: "Trykk for å snakke",
    buttonSubtext: "Mikrofonen er av til du trykker",
    statusText: "Hva har du på hjertet? Jeg kan hjelpe deg å finne svar, samle tanker eller komme i gang.",
    auraColorCenter: "#A969F4",
    auraColorOuter: "#FAF9F6",
    auraPulseSpeedMs: 2400,
    isMicActive: false,
  },
  listening: {
    buttonText: "Jeg lytter...",
    buttonSubtext: "Bare snakk – eller trykk for å avslutte",
    statusText: "Jeg hører på deg! Bare snakk i vei...",
    auraColorCenter: "#C56BF0",
    auraColorOuter: "#FAF9F6",
    auraPulseSpeedMs: 1200,
    isMicActive: true,
  },
  thinking: {
    buttonText: "Tenker...",
    buttonSubtext: "Trykk for å avslutte samtalen",
    statusText: "La meg tenke litt på det...",
    auraColorCenter: "#859BF5",
    auraColorOuter: "#FAF9F6",
    auraPulseSpeedMs: 800,
    isMicActive: false,
  },
  speaking: {
    buttonText: "Josefine snakker",
    buttonSubtext: "Trykk for å avslutte samtalen",
    statusText: "Her er det jeg fant ut:",
    auraColorCenter: "#B673F8",
    auraColorOuter: "#FAF9F6",
    auraPulseSpeedMs: 1000,
    isMicActive: false,
  },
};

/**
 * Henter visuell konfigurasjon for en gitt tilstand.
 * @param {JosefineState} state
 * @returns {StateDisplayConfig}
 */
function getConfigForState(state) {
  return STATE_CONFIGS[state] || STATE_CONFIGS.idle;
}

/**
 * Beregner neste tilstand ved trykk på mikrofonknappen.
 * @param {JosefineState} currentState
 * @returns {JosefineState}
 */
function handleMicButtonPressed(currentState) {
  if (currentState === "idle") {
    return "listening";
  } else if (currentState === "listening") {
    return "thinking";
  } else {
    // Hvis hun snakker eller tenker, vil et trykk avbryte tilbake til hvilemodus
    return "idle";
  }
}

/**
 * Forbereder en oppgave som skal rutes til Pi Coding Agent (Gemini 3.8 Flash).
 * Kalles når Gemini Live detekterer et verktøykall underveis i samtalen.
 *
 * @param {'image_search' | 'music_playback' | 'window_control' | 'generic'} type
 * @param {string} prompt
 * @param {Record<string, any>} [params]
 * @returns {AgentTask}
 */
function createAgentTask(type, prompt, params = {}) {
  const id = "task_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
  return {
    id,
    type,
    prompt,
    params,
  };
}
