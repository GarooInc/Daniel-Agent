import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchFaqs } from "../../knowledge-base/index.js";

export const searchFaqsTool = tool(
  async ({ query }) => {
    const results = searchFaqs(query);
    if (results.length === 0) return "No se encontraron FAQs relacionadas.";
    return results
      .map((faq) => `[${faq.producto}] P: ${faq.pregunta}\nR: ${faq.respuesta}`)
      .join("\n\n");
  },
  {
    name: "buscar_faqs",
    description: "Busca preguntas frecuentes relacionadas a una consulta del cliente sobre los productos de RedTec.",
    schema: z.object({
      query: z.string().describe("Términos de búsqueda o la pregunta del cliente"),
    }),
  },
);
