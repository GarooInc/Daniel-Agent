import { describe, expect, it, vi } from "vitest";

const embedText = vi.fn();
const searchFaqsBySimilarity = vi.fn();

vi.mock("../../integrations/embeddings/openrouter-embeddings.js", () => ({ embedText }));
vi.mock("../../integrations/mongo/documents.js", () => ({ searchFaqsBySimilarity }));

const { searchFaqsTool } = await import("./search-faqs.js");

const FAKE_EMBEDDING = [0.1, 0.2, 0.3];

describe("buscar_faqs tool", () => {
  it("devuelve las FAQs por encima del umbral de relevancia, formateadas", async () => {
    embedText.mockResolvedValue(FAKE_EMBEDDING);
    searchFaqsBySimilarity.mockResolvedValue([
      { id: "isabella-002", producto: "Isabella", categoria: "configuracion", pregunta: "¿Cómo conecto el calendario?", respuesta: "Desde Integraciones.", tags: [], score: 0.91 },
    ]);

    const result = await searchFaqsTool.invoke({ query: "calendario" });

    expect(embedText).toHaveBeenCalledWith("calendario");
    expect(result).toContain("P: ¿Cómo conecto el calendario?");
    expect(result).toContain("R: Desde Integraciones.");
  });

  it("descarta resultados por debajo del umbral de relevancia", async () => {
    embedText.mockResolvedValue(FAKE_EMBEDDING);
    searchFaqsBySimilarity.mockResolvedValue([
      { id: "sofi-001", producto: "Sofi", categoria: "uso", pregunta: "algo poco relacionado", respuesta: "...", tags: [], score: 0.4 },
    ]);

    const result = await searchFaqsTool.invoke({ query: "palabra-que-no-existe-en-ninguna-faq" });

    expect(result).toBe("No se encontraron FAQs relacionadas.");
  });

  it("avisa cuando no hay resultados en vez de devolver una lista vacía", async () => {
    embedText.mockResolvedValue(FAKE_EMBEDDING);
    searchFaqsBySimilarity.mockResolvedValue([]);

    const result = await searchFaqsTool.invoke({ query: "palabra-que-no-existe-en-ninguna-faq" });

    expect(result).toBe("No se encontraron FAQs relacionadas.");
  });

  it("pasa el producto como filtro cuando el modelo lo da", async () => {
    embedText.mockResolvedValue(FAKE_EMBEDDING);
    searchFaqsBySimilarity.mockResolvedValue([]);

    await searchFaqsTool.invoke({ query: "calendario", producto: "Isabella" });

    expect(searchFaqsBySimilarity).toHaveBeenCalledWith(FAKE_EMBEDDING, { producto: "Isabella", limit: 5 });
  });
});
