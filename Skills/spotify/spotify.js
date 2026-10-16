#!/usr/bin/env node
// @ts-check
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

/**
 * @fileoverview Spotify Web API + spotifyd / MPRIS (playerctl) CLI for Josefine.
 * Lar Arbeidsmauren søke opp og starte sanger, album og spillelister på "Josefine" (spotifyd)
 * helt uten å åpne et Spotify-nettleservindu, slik at kun de små spilleknappene øverst i
 * Josefine-panelet (Quickshell MPRIS) vises!
 */

const CONFIG_DIR = path.join(os.homedir(), ".config", "josefine");
const ENV_FILE = path.join(CONFIG_DIR, "env");
const TOKENS_FILE = path.join(CONFIG_DIR, "spotify-tokens.json");
const REDIRECT_URI = "http://127.0.0.1:8888/callback";

function loadEnvFile() {
  if (!existsSync(ENV_FILE)) return;
  const content = readFileSync(ENV_FILE, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const cleaned = trimmed.replace(/^export\s+/, "");
    const eqIdx = cleaned.indexOf("=");
    if (eqIdx === -1) continue;
    const key = cleaned.slice(0, eqIdx).trim();
    let val = cleaned.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvFile();

function getStoredTokens() {
  if (existsSync(TOKENS_FILE)) {
    try {
      return JSON.parse(readFileSync(TOKENS_FILE, "utf8"));
    } catch {}
  }
  return {};
}

function saveStoredTokens(tokens) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2) + "\n", "utf8");
}

function ensureSpotifydRunning() {
  try {
    execFileSync("pgrep", ["-x", "spotifyd"], { stdio: "ignore" });
    return;
  } catch {}
  try {
    const confPath = path.join(os.homedir(), ".config", "spotifyd", "spotifyd.conf");
    const args = ["--no-daemon"];
    if (existsSync(confPath)) {
      args.push("--config-path", confPath);
    }
    spawn("spotifyd", args, { detached: true, stdio: "ignore" }).unref();
  } catch {}
}

async function getAccessToken() {
  const stored = getStoredTokens();
  const clientId = process.env.SPOTIFY_CLIENT_ID || stored.clientId;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || stored.clientSecret;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN || stored.refreshToken;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Mangler Spotify API-nøkler (SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN). " +
        "Legg inn SPOTIFY_CLIENT_ID og SPOTIFY_CLIENT_SECRET i ~/.config/josefine/env og kjør: node Skills/spotify/spotify.js auth",
    );
  }

  if (stored.accessToken && stored.expiresAt && Date.now() < stored.expiresAt - 30000) {
    return stored.accessToken;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Kunne ikke fornye Spotify access_token (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const updated = {
    ...stored,
    clientId,
    clientSecret,
    refreshToken: data.refresh_token || refreshToken,
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  saveStoredTokens(updated);
  return data.access_token;
}

/**
 * @param {string} endpoint
 * @param {RequestInit} [init]
 */
async function spotifyFetch(endpoint, init = {}) {
  const token = await getAccessToken();
  const url = endpoint.startsWith("http") ? endpoint : `https://api.spotify.com/v1${endpoint}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  return res;
}

async function findTargetDeviceId() {
  ensureSpotifydRunning();
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await spotifyFetch("/me/player/devices");
    if (res.ok) {
      const data = await res.json();
      const devices = data.devices || [];
      const josefineDev = devices.find((d) =>
        String(d.name || "").toLowerCase().includes("josefine"),
      );
      if (josefineDev) return josefineDev.id;
      const activeDev = devices.find((d) => d.is_active);
      if (activeDev) return activeDev.id;
      if (devices.length > 0) return devices[0].id;
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return null;
}

async function playSearch(query, searchType = "track") {
  const params = new URLSearchParams({
    q: query,
    type: searchType,
    market: "NO",
    limit: "5",
  });
  const searchRes = await spotifyFetch(`/search?${params.toString()}`);
  if (!searchRes.ok) {
    throw new Error(`Spotify-søk feilet: ${searchRes.status}`);
  }
  const data = await searchRes.json();

  let item = null;
  if (searchType === "track") item = data.tracks?.items?.[0];
  else if (searchType === "playlist") item = data.playlists?.items?.[0];
  else if (searchType === "album") item = data.albums?.items?.[0];
  else if (searchType === "artist") item = data.artists?.items?.[0];

  if (!item) {
    throw new Error(`Fant ingen treff på Spotify for "${query}" (${searchType}).`);
  }

  const deviceId = await findTargetDeviceId();
  const playEndpoint = deviceId
    ? `/me/player/play?device_id=${encodeURIComponent(deviceId)}`
    : "/me/player/play";

  const body =
    searchType === "track"
      ? { uris: [item.uri] }
      : { context_uri: item.uri };

  const playRes = await spotifyFetch(playEndpoint, {
    method: "PUT",
    body: JSON.stringify(body),
  });

  if (!playRes.ok && playRes.status !== 204) {
    const errText = await playRes.text();
    throw new Error(
      `Kunne ikke starte avspilling (${playRes.status}): ${errText}. Sjekk at spotifyd er logget inn.`,
    );
  }

  const artistName = item.artists?.map((a) => a.name).join(", ") || item.owner?.display_name || "";
  console.log(
    `🎵 Spiller nå på Josefine: "${item.name}"${artistName ? ` av ${artistName}` : ""} (${item.uri})`,
  );
}

async function runOAuthFlow() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("Sett SPOTIFY_CLIENT_ID og SPOTIFY_CLIENT_SECRET i ~/.config/josefine/env først.");
    process.exit(1);
  }

  const scopes = [
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
  ].join(" ");

  const authUrl =
    "https://accounts.spotify.com/authorize?" +
    new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: scopes,
      redirect_uri: REDIRECT_URI,
    }).toString();

  console.log("\n🌸 Åpne denne lenken i nettleseren for å koble Spotify til Josefine:\n");
  console.log(authUrl);
  console.log("\nVenter på callback på " + REDIRECT_URI + " ...");

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || "/", REDIRECT_URI);
    if (reqUrl.pathname !== "/callback") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const code = reqUrl.searchParams.get("code");
    if (!code) {
      res.writeHead(400);
      res.end("Missing code");
      return;
    }

    try {
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        throw new Error(JSON.stringify(tokenData));
      }

      saveStoredTokens({
        clientId,
        clientSecret,
        refreshToken: tokenData.refresh_token,
        accessToken: tokenData.access_token,
        expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
      });

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>✅ Josefine er koblet til Spotify! Du kan lukke dette vinduet.</h1>");
      console.log("\n✅ Lagret Spotify refresh_token i " + TOKENS_FILE);
      server.close(() => process.exit(0));
    } catch (err) {
      res.writeHead(500);
      res.end("Feil: " + String(err));
      console.error("Feil under token-utveksling:", err);
      server.close(() => process.exit(1));
    }
  });

  server.listen(8888, "127.0.0.1");
}

function runPlayerctl(action) {
  try {
    const out = execFileSync("playerctl", [action], { encoding: "utf8" }).trim();
    if (out) console.log(out);
    else console.log(`✓ Utførte playerctl ${action}`);
  } catch (err) {
    console.error(`Kunne ikke kjøre playerctl ${action}: ${err.message}`);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || "help";

  switch (cmd) {
    case "play": {
      let type = "track";
      const rest = [];
      for (let i = 1; i < args.length; i++) {
        if (args[i] === "--type" && args[i + 1]) {
          type = args[i + 1];
          i++;
        } else {
          rest.push(args[i]);
        }
      }
      const query = rest.join(" ").trim();
      if (!query) {
        runPlayerctl("play");
        return;
      }
      await playSearch(query, type);
      break;
    }
    case "pause":
      runPlayerctl("pause");
      break;
    case "resume":
    case "toggle":
      runPlayerctl("play-pause");
      break;
    case "next":
      runPlayerctl("next");
      break;
    case "prev":
    case "previous":
      runPlayerctl("previous");
      break;
    case "stop":
      runPlayerctl("stop");
      break;
    case "status": {
      try {
        const status = execFileSync(
          "playerctl",
          ["metadata", "--format", "{{status}}: {{title}} – {{artist}} ({{playerName}})"],
          { encoding: "utf8" },
        ).trim();
        console.log(status);
      } catch {
        console.log("Ingen aktiv musikkspiller akkurat nå.");
      }
      break;
    }
    case "auth":
      await runOAuthFlow();
      break;
    default:
      console.log("Bruk: spotify.js <kommando>");
      console.log("\nKommandoer:");
      console.log('  play "<søkestreng>" [--type track|album|playlist|artist]  Søk og spill av på spotifyd');
      console.log("  pause | resume | next | prev | stop | status              Styr aktiv spiller via MPRIS");
      console.log("  auth                                                      Engangs-innlogging mot Spotify Web API");
      break;
  }
}

main().catch((err) => {
  console.error("❌ " + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
