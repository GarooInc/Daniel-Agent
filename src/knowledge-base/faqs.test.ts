import { describe, expect, it } from "vitest";
import { getAllFaqs, getFaqsByProducto, searchFaqs } from "./faqs.js";

describe("searchFaqs", () => {
  it("encuentra por texto de la pregunta, sin importar mayúsculas", () => {
    const results = searchFaqs("CALENDARIO");
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every(
        (faq) =>
          faq.pregunta.toLowerCase().includes("calendario") ||
          faq.respuesta.toLowerCase().includes("calendario") ||
          faq.producto.toLowerCase().includes("calendario") ||
          faq.tags.some((tag) => tag.toLowerCase().includes("calendario")),
      ),
    ).toBe(true);
  });

  it("encuentra por tag aunque el texto no esté en la pregunta ni la respuesta", () => {
    const results = searchFaqs("ventas");
    expect(results.some((faq) => faq.tags.includes("ventas"))).toBe(true);
  });

  it("devuelve vacío si no hay ninguna coincidencia", () => {
    expect(searchFaqs("palabra-que-no-existe-en-ninguna-faq")).toEqual([]);
  });
});

describe("getFaqsByProducto", () => {
  it("filtra exacto por producto, sin importar mayúsculas", () => {
    const results = getFaqsByProducto("sofi");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((faq) => faq.producto === "Sofi")).toBe(true);
  });

  it("devuelve vacío para un producto inexistente", () => {
    expect(getFaqsByProducto("ProductoInventado")).toEqual([]);
  });
});

describe("getAllFaqs", () => {
  it("devuelve todas las FAQs cargadas del JSON", () => {
    expect(getAllFaqs().length).toBeGreaterThan(0);
  });
});
