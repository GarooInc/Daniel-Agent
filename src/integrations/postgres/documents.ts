import pgvector from "pgvector/pg";
import { getPool } from "./client.js";
import type { Faq } from "../../knowledge-base/types.js";

// Mismas 3 funciones exportadas que integrations/mongo/documents.ts, misma firma — ver
// plans/2026-08-18-migracion-postgresql-pgvector.md ("hallazgo clave"): el resto del código
// (agent/tools/search-faqs.ts, migrate-faqs.ts) no necesita saber qué DB hay detrás.
// A diferencia de Mongo, no se persiste un campo "text" aparte con pregunta+respuesta
// concatenadas — acá pregunta/respuesta ya son columnas propias, y el embedding (que sí se
// calculó sobre ese texto combinado, ver migrate-faqs.ts) es lo único que hace falta para buscar.
export async function upsertFaqDocument(faq: Faq, embedding: number[]): Promise<void> {
  const pool = await getPool();
  await pool.query(
    `INSERT INTO documents (id, producto, categoria, pregunta, respuesta, tags, embedding, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (id) DO UPDATE SET
       producto = EXCLUDED.producto,
       categoria = EXCLUDED.categoria,
       pregunta = EXCLUDED.pregunta,
       respuesta = EXCLUDED.respuesta,
       tags = EXCLUDED.tags,
       embedding = EXCLUDED.embedding,
       updated_at = now()`,
    [faq.id, faq.producto, faq.categoria, faq.pregunta, faq.respuesta, faq.tags ?? null, pgvector.toSql(embedding)],
  );
}

// En Atlas, el índice de vector search se crea aparte y tarda en quedar "READY" en background
// (ver mongo/documents.ts). En Postgres el índice HNSW ya se creó de forma síncrona en el
// bootstrap del schema (client.ts/schema.ts) — esta función queda como no-op para no tener que
// tocar el caller (migrate-faqs.ts) al momento del corte.
export async function ensureFaqVectorIndex(): Promise<void> {
  await getPool();
}

export type FaqSearchResult = Faq & { score: number };

// Cosine distance de pgvector (`<=>`) va de 0 (idéntico) a 2 (opuesto) — `1 - distancia` da un
// score en la misma dirección que el vectorSearchScore de Atlas (más alto = más parecido), pero
// NO es la misma escala numérica. MIN_SCORE en agent/tools/search-faqs.ts ya se recalibró para
// esta escala (2026-08-21), aunque con datos sintéticos — falta calibrarlo con tráfico real, ver
// el logging agregado en search-faqs.ts.
export async function searchFaqsBySimilarity(
  queryEmbedding: number[],
  opts: { producto?: string; limit?: number } = {},
): Promise<FaqSearchResult[]> {
  const pool = await getPool();
  const limit = opts.limit ?? 5;
  const embeddingSql = pgvector.toSql(queryEmbedding);

  const result = await pool.query<FaqSearchResult>(
    `SELECT id, producto, categoria, pregunta, respuesta, tags,
            1 - (embedding <=> $1) AS score
     FROM documents
     WHERE ($2::text IS NULL OR producto = $2)
     ORDER BY embedding <=> $1
     LIMIT $3`,
    [embeddingSql, opts.producto ?? null, limit],
  );
  return result.rows;
}
