import { createHash } from "node:crypto";
import pgvector from "pgvector/pg";
import { getPool } from "./client.js";
import { embedTexts } from "../embeddings/openrouter-embeddings.js";
import { logger } from "../../config/logger.js";

// Mantiene el `embedding` de `documents` al día tras ediciones de pregunta/respuesta desde
// Support-Agent-Panel (UPDATE directo sobre pregunta/respuesta/updated_at, ver
// sql/grant-panel-role.sql — el panel nunca escribe `embedding`). Mismo patrón de proceso que
// retention.ts: un setInterval propio, arrancado una vez desde bot.ts, sin pg_cron.
//
// Decisión original (coordinada con Support-Agent-Panel, 2026-08-28): reembeder TODO `documents`
// en cada barrido, sin estado nuevo. Con 46 FAQs reales (sembradas el 2026-09-24) eso eran ~130 M
// de tokens/mes y ~2 M de UPDATEs/mes para recalcular vectores idénticos. Revisión (2026-10-08):
// se guarda en memoria del proceso un hash de pregunta+respuesta por `id` y solo se reembebe lo
// que cambió — sigue sin columna/tabla de estado nueva. Tras un reinicio el mapa está vacío, así
// que el primer barrido reembebe todo una vez (costo despreciable, centavos).
const SYNC_INTERVAL_MS = 60_000;

// id -> hash del texto con el que se calculó el embedding vigente en esta instancia del proceso.
const embeddedHashes = new Map<string, string>();

function hashText(texto: string): string {
  return createHash("sha256").update(texto).digest("hex");
}

// Exportada solo para tests; en producción la dispara el setInterval de startFaqEmbeddingSync().
export async function runSync(): Promise<void> {
  const pool = await getPool();
  const { rows } = await pool.query<{ id: string; pregunta: string; respuesta: string }>(
    "SELECT id, pregunta, respuesta FROM documents",
  );

  // Filas borradas del panel/BD: no dejar hashes huérfanos creciendo en memoria.
  const idsVigentes = new Set(rows.map((row) => row.id));
  for (const id of embeddedHashes.keys()) {
    if (!idsVigentes.has(id)) embeddedHashes.delete(id);
  }

  // Mismo texto combinado que migrate-faqs.ts usa para calcular el embedding original.
  const pendientes = rows
    .map((row) => {
      const texto = `${row.pregunta}\n\n${row.respuesta}`;
      return { id: row.id, texto, hash: hashText(texto) };
    })
    .filter((item) => embeddedHashes.get(item.id) !== item.hash);
  if (pendientes.length === 0) return;

  let embeddings: number[][];
  try {
    embeddings = await embedTexts(pendientes.map((item) => item.texto));
  } catch (error) {
    logger.warn({ err: error }, "Falló el recálculo periódico de embeddings de documents");
    return;
  }

  for (const [i, item] of pendientes.entries()) {
    await pool.query("UPDATE documents SET embedding = $1 WHERE id = $2", [pgvector.toSql(embeddings[i]), item.id]);
    // Solo se marca como al día después de escribir; si el UPDATE falla, el próximo barrido reintenta.
    embeddedHashes.set(item.id, item.hash);
  }
  logger.info({ count: pendientes.length, total: rows.length }, "Recalculados embeddings de documents");
}

// Solo para tests: vuelve al estado de "proceso recién arrancado".
export function resetFaqEmbeddingSyncState(): void {
  embeddedHashes.clear();
}

let started = false;

// Llamar una sola vez al arrancar el bot (ver channels/slack/bot.ts) — idempotente.
export function startFaqEmbeddingSync(): void {
  if (started) return;
  started = true;
  void runSync();
  setInterval(() => void runSync(), SYNC_INTERVAL_MS).unref();
}
