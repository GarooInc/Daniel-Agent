import { getPool } from "./client.js";
import { logger } from "../../config/logger.js";

// Postgres no tiene TTL indexes nativos (a diferencia de Mongo — ver webhook-events.ts,
// mongo/webhook-events.ts y redtec-realtime/platform-metrics.ts). En vez de sumar la extensión
// pg_cron (complejidad/permisos extra en el VPS), la limpieza corre acá mismo, en el propio
// proceso de Daniel: una vez al llamar a startRetentionCleanup() y después cada
// CLEANUP_INTERVAL_MS — el proceso ya vive corriendo 24/7, mismo motivo por el que hoy no hace
// falta un cron externo para nada más en este proyecto.
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // cada 6h alcanza de sobra para un TTL en días

const RETENTION_POLICIES = [
  { table: "webhook_raw_events", column: "received_at", days: 30 },
  { table: "platform_metrics", column: "received_at", days: 7 },
] as const;

async function runCleanup(): Promise<void> {
  const pool = await getPool();
  for (const { table, column, days } of RETENTION_POLICIES) {
    try {
      // table/column salen de una constante fija de este archivo, no de input externo — no hay
      // riesgo de inyección al interpolarlos directo en el SQL.
      const result = await pool.query(`DELETE FROM ${table} WHERE ${column} < now() - $1::interval`, [`${days} days`]);
      if (result.rowCount) {
        logger.info({ table, deleted: result.rowCount }, "Limpieza de retención en Postgres");
      }
    } catch (error) {
      logger.warn({ err: error, table }, "Falló la limpieza de retención en Postgres");
    }
  }
}

let started = false;

// Llamar una sola vez al arrancar el bot (ver channels/slack/bot.ts) — idempotente, un segundo
// llamado no suma un segundo interval corriendo en paralelo.
export function startRetentionCleanup(): void {
  if (started) return;
  started = true;
  void runCleanup();
  setInterval(() => void runCleanup(), CLEANUP_INTERVAL_MS).unref();
}
