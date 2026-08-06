import { describe, expect, it } from "vitest";
import { getAllFaqs } from "./faqs.js";

describe("getAllFaqs", () => {
  it("devuelve todas las FAQs cargadas del JSON", () => {
    expect(getAllFaqs().length).toBeGreaterThan(0);
  });
});
