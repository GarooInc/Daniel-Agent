import { getPool } from "./client.js";
import { logger } from "../../config/logger.js";

// Heartbeat de proceso, leído por Support-Agent-Panel para el indicador "Daniel en línea" del
// Topbar (panel decide online/offline por antigüedad de `updated_at`, ver schema.ts). Mismo
// patrón de proceso que retention.ts/faq-embedding-sync.ts: un setInterval propio, arrancado
// una vez desde bot.ts, sin pg_cron.
const HEARTBEAT_INTERVAL_MS = 25_000;

async function beat(): Promise<void> {
  try {
    const pool = await getPool();
    await pool.query(
      `INSERT INTO daniel_heartbeat (id, updated_at) VALUES (1, now())
       ON CONFLICT (id) DO UPDATE SET updated_at = now()`,
    );
  } catch (error) {
    logger.warn({ err: error }, "Falló el heartbeat de Postgres");
  }
}

let started = false;

// Llamar una sola vez al arrancar el bot (ver channels/slack/bot.ts) — idempotente.
export function startHeartbeat(): void {
  if (started) return;
  started = true;
  void beat();
  setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS).unref();
}
