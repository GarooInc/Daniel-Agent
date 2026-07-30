import { describe, expect, it } from "vitest";
import { searchFaqsTool } from "./search-faqs.js";

describe("buscar_faqs tool", () => {
  it("devuelve las FAQs encontradas formateadas", async () => {
    const result = await searchFaqsTool.invoke({ query: "calendario" });
    expect(result).toContain("P:");
    expect(result).toContain("R:");
  });

  it("avisa cuando no hay resultados en vez de devolver una lista vacía", async () => {
    const result = await searchFaqsTool.invoke({ query: "palabra-que-no-existe-en-ninguna-faq" });
    expect(result).toBe("No se encontraron FAQs relacionadas.");
  });
});
