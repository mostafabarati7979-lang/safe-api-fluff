/**
 * Production entry point for standard Node.js hosting (cPanel / Passenger, VPS, Docker).
 *
 *   node server.js
 *
 * It loads `.env` (cPanel does not do this for you), then boots the Nitro
 * `node-server` bundle produced by `npm run build`, which starts an HTTP
 * listener on process.env.PORT (Passenger injects PORT automatically).
 *
 * Requires Node.js 20 LTS or 22 LTS.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

/** Minimal .env loader — no dependency, never overrides real environment values. */
function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(resolve(rootDir, ".env"));

process.env.NODE_ENV ??= "production";
process.env.PORT ??= "3000";
process.env.HOST ??= "0.0.0.0";

// Accept the generic Supabase variable names from .env.example and map them
// onto the names the server runtime reads. Service role key stays server-only.
process.env.SUPABASE_PUBLISHABLE_KEY ??= process.env.SUPABASE_ANON_KEY ?? "";
process.env.SUPABASE_ANON_KEY ??= process.env.SUPABASE_PUBLISHABLE_KEY ?? "";

const serverEntry = resolve(rootDir, "dist/server/index.mjs");

if (!existsSync(serverEntry)) {
  console.error(
    `[server] Build output not found at ${serverEntry}\n` +
      `[server] Run "npm run build" before "npm start".`,
  );
  process.exit(1);
}

await import(pathToFileURL(serverEntry).href);
