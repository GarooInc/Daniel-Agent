import faqsData from "../data/faqs.json" with { type: "json" };
import type { Faq } from "./types.js";

const faqs = faqsData as Faq[];

export function searchFaqs(query: string): Faq[] {
  const q = query.toLowerCase();
  return faqs.filter(
    (faq) =>
      faq.pregunta.toLowerCase().includes(q) ||
      faq.respuesta.toLowerCase().includes(q) ||
      faq.producto.toLowerCase().includes(q) ||
      faq.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
}

export function getFaqsByProducto(producto: string): Faq[] {
  const p = producto.toLowerCase();
  return faqs.filter((faq) => faq.producto.toLowerCase() === p);
}

export function getAllFaqs(): Faq[] {
  return faqs;
}
