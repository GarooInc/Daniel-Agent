import pgvector from "pgvector/pg";
import { getPool } from "./client.js";
import { embedTexts } from "../embeddings/openrouter-embeddings.js";
import { logger } from "../../config/logger.js";

// Mantiene el `embedding` de `documents` al día tras ediciones de pregunta/respuesta desde
// Support-Agent-Panel (UPDATE directo sobre pregunta/respuesta/updated_at, ver
// sql/grant-panel-role.sql — el panel nunca escribe `embedding`). Mismo patrón de proceso que
// retention.ts: un setInterval propio, arrancado una vez desde bot.ts, sin pg_cron.
//
// Decisión (coordinada con Support-Agent-Panel, 2026-08-28): opción B — reembeder TODO
// `documents` en cada barrido, sin columna/tabla de estado nueva (ej. `embedding_updated_at` o
// una tabla `embedding_sync_state`). Con el volumen de FAQs actual (pocas decenas, ver
// data/faqs.json) la simplicidad de no sumar estado pesa más que el costo extra de llamadas a
// OpenRouter. Si `documents` crece mucho, revisar y migrar a comparar contra `updated_at`.
const SYNC_INTERVAL_MS = 60_000;

async function runSync(): Promise<void> {
  const pool = await getPool();
  const { rows } = await pool.query<{ id: string; pregunta: string; respuesta: string }>(
    "SELECT id, pregunta, respuesta FROM documents",
  );
  if (rows.length === 0) return;

  // Mismo texto combinado que migrate-faqs.ts usa para calcular el embedding original.
  const textos = rows.map((row) => `${row.pregunta}\n\n${row.respuesta}`);
  let embeddings: number[][];
  try {
    embeddings = await embedTexts(textos);
  } catch (error) {
    logger.warn({ err: error }, "Falló el recálculo periódico de embeddings de documents");
    return;
  }

  for (const [i, row] of rows.entries()) {
    await pool.query("UPDATE documents SET embedding = $1 WHERE id = $2", [pgvector.toSql(embeddings[i]), row.id]);
  }
  logger.info({ count: rows.length }, "Recalculados embeddings de documents");
}

let started = false;

// Llamar una sola vez al arrancar el bot (ver channels/slack/bot.ts) — idempotente.
export function startFaqEmbeddingSync(): void {
  if (started) return;
  started = true;
  void runSync();
  setInterval(() => void runSync(), SYNC_INTERVAL_MS).unref();
}
