import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { embedText } from "../../integrations/embeddings/openrouter-embeddings.js";
import { searchFaqsBySimilarity } from "../../integrations/mongo/documents.js";
import { PRODUCTO_VALUES } from "../../integrations/monday/create-ticket.js";
import { logger } from "../../config/logger.js";

// Umbral de relevancia mínimo (vectorSearchScore de Atlas, cosine, 0 a 1) para no devolverle
// al modelo una FAQ que "parece" relacionada por similitud pero en realidad no responde la
// consulta — mejor decir "no encontré nada" que forzar un match débil. Valor inicial sin
// calibrar contra uso real todavía; ajustar si en producción se ve que descarta FAQs válidas
// o, al revés, deja pasar FAQs que no aplican.
const MIN_SCORE = 0.75;

export const searchFaqsTool = tool(
  async ({ query, producto }) => {
    const queryEmbedding = await embedText(query);
    const results = await searchFaqsBySimilarity(queryEmbedding, { producto, limit: 5 });
    const relevantes = results.filter((r) => r.score >= MIN_SCORE);

    // DEBUG temporal (2026-08-06): diagnosticar por qué buscar_faqs no encontró una FAQ que
    // por script sí matcheaba con score alto — para ver con qué query/producto llama el
    // modelo de verdad, y qué scores obtuvo, antes de decidir si es un bug de código o de
    // disciplina del modelo. Sacar una vez confirmado. Ver ESTADO-PROYECTO.md.
    logger.info(
      { query, producto, scores: results.map((r) => ({ id: r.id, score: r.score })), relevantesCount: relevantes.length },
      "DEBUG buscar_faqs",
    );

    if (relevantes.length === 0) return "No se encontraron FAQs relacionadas.";
    return relevantes.map((faq) => `[${faq.producto}] P: ${faq.pregunta}\nR: ${faq.respuesta}`).join("\n\n");
  },
  {
    name: "buscar_faqs",
    description:
      "Busca preguntas frecuentes relacionadas a una consulta del cliente sobre los productos de RedTec, por similitud semántica (no hace falta que las palabras coincidan exacto con la FAQ).",
    schema: z.object({
      query: z.string().describe("La consulta o pregunta del cliente, en sus propias palabras"),
      producto: z.enum(PRODUCTO_VALUES).optional().describe("Producto de RedTec sobre el que trata la consulta, si ya se sabe — acota la búsqueda"),
    }),
  },
);
