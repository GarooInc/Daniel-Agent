import { env } from "../../config/env.js";

const EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";

// Mismo modelo que produce los vectores de 1536 dimensiones ya usados en Centralizado.documents
// (otro proyecto de RedTec/Spectrum) — mantiene compatible la dimensión del índice de vector
// search entre proyectos, y evita sumar una API key nueva (OpenRouter ya expone /embeddings,
// reusa OPENROUTER_API_KEY).
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

export class EmbeddingApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingApiError";
  }
}

type EmbeddingsResponse = {
  data: { embedding: number[]; index: number }[];
};

// Acepta uno o varios textos en la misma llamada — la migración de FAQs embebe las 16 juntas
// en vez de una request por FAQ.
export async function embedTexts(texts: string[]): Promise<number[][]> {
  let response: Response;
  try {
    response = await fetch(EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.openRouterApiKey}`,
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    });
  } catch (error) {
    throw new EmbeddingApiError(
      `No se pudo conectar con la API de embeddings de OpenRouter: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const body = (await response.json()) as Partial<EmbeddingsResponse> & { error?: unknown };
  if (!response.ok || !body.data) {
    throw new EmbeddingApiError(`OpenRouter embeddings error: ${JSON.stringify(body.error ?? body)}`);
  }

  // La API devuelve los resultados en el mismo orden que `texts`, con un índice explícito por
  // si algún proveedor los reordena — se ordena por las dudas antes de devolver.
  return [...body.data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}
