// @ts-check
import { execFile } from "node:child_process";
import path from "node:path";

/**
 * @fileoverview Nattlig skjermhvile for Josefine (kl. 20:00 til 06:30).
 * Slår automatisk av skjermen (DPMS off) og pauser eventuell musikk kl. 20:00,
 * og vekker skjermen igjen kl. 06:30 om morgenen.
 */

/**
 * Returnerer true dersom oppgitt tidspunkt er innenfor nattvinduet (20:00–06:30).
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isNightSleepTime(now = new Date()) {
  const h = now.getHours();
  const m = now.getMinutes();
  if (h >= 20) return true;
  if (h < 6) return true;
  if (h === 6 && m < 30) return true;
  return false;
}

/**
 * Starter en bakgrunnstimer som sjekker hvert minutt om skjermen skal gå i
 * nattmodus (kl. 20:00) eller våkne igjen (kl. 06:30).
 *
 * @param {Object} options
 * @param {string} options.repoDir
 * @param {(msg: string) => void} [options.onLog]
 */
export function startNightSchedule(options) {
  const log = options.onLog || (() => {});
  const scriptPath = path.join(options.repoDir, "scripts", "audio-screen.sh");
  /** @type {boolean | null} */
  let wasNight = isNightSleepTime(new Date());

  function setScreenState(sleep) {
    const sub = sleep ? "off" : "on";
    log(`[Nattplan] Setter skjerm til ${sub} (${sleep ? "God natt 20:00" : "God morgen 06:30"})`);
    execFile(scriptPath, ["screen", sub], (err) => {
      if (err) {
        log(`[Nattplan] Kunne ikke kjøre audio-screen.sh screen ${sub}: ${err.message}`);
      }
    });
  }

  const timer = setInterval(() => {
    const nowNight = isNightSleepTime(new Date());
    if (wasNight !== nowNight) {
      wasNight = nowNight;
      setScreenState(nowNight);
    }
  }, 60 * 1000);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return {
    stop: () => clearInterval(timer),
  };
}
