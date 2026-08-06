import { getDb } from "./client.js";
import { EMBEDDING_DIMENSIONS } from "../embeddings/openrouter-embeddings.js";
import type { Faq } from "../../knowledge-base/types.js";

const COLLECTION = "documents";
const VECTOR_INDEX_NAME = "faq_vector_index";

type FaqDocument = Faq & { text: string; embedding: number[] };

// Mismo patrón que Centralizado.documents (otro proyecto de RedTec/Spectrum, 200 documentos
// en producción probados) — vector search clásico con embedding pre-calculado (no Auto-Embed
// de Atlas), para mantener consistencia entre proyectos. El filtro pre-vector search acá es
// "producto" (Isabella/Sofi/Widget-chatbot/Otro), equivalente al "proyecto" de Centralizado.
export async function upsertFaqDocument(faq: Faq, embedding: number[]): Promise<void> {
  const db = await getDb();
  const text = `${faq.pregunta}\n\n${faq.respuesta}`;
  await db.collection<FaqDocument>(COLLECTION).updateOne({ id: faq.id }, { $set: { ...faq, text, embedding } }, { upsert: true });
}

// Idempotente: si el índice ya existe (por nombre), no hace nada — se puede llamar de nuevo
// sin miedo. Recién creado, Atlas tarda unos segundos/minutos en dejarlo "READY" en background;
// $vectorSearch no funciona hasta entonces.
export async function ensureFaqVectorIndex(): Promise<void> {
  const db = await getDb();
  const collection = db.collection(COLLECTION);
  const existing = await collection.listSearchIndexes().toArray();
  if (existing.some((index) => index.name === VECTOR_INDEX_NAME)) return;

  await collection.createSearchIndex({
    name: VECTOR_INDEX_NAME,
    type: "vectorSearch",
    definition: {
      fields: [
        { type: "vector", path: "embedding", numDimensions: EMBEDDING_DIMENSIONS, similarity: "cosine" },
        { type: "filter", path: "producto" },
      ],
    },
  });
}

export type FaqSearchResult = Faq & { score: number };

export async function searchFaqsBySimilarity(
  queryEmbedding: number[],
  opts: { producto?: string; limit?: number } = {},
): Promise<FaqSearchResult[]> {
  const db = await getDb();
  const limit = opts.limit ?? 5;

  return db
    .collection<FaqDocument>(COLLECTION)
    .aggregate<FaqSearchResult>([
      {
        $vectorSearch: {
          index: VECTOR_INDEX_NAME,
          path: "embedding",
          queryVector: queryEmbedding,
          numCandidates: limit * 10,
          limit,
          ...(opts.producto ? { filter: { producto: opts.producto } } : {}),
        },
      },
      {
        $project: {
          _id: 0,
          id: 1,
          producto: 1,
          categoria: 1,
          pregunta: 1,
          respuesta: 1,
          tags: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ])
    .toArray();
}
