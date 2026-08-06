import faqsData from "../data/faqs.json" with { type: "json" };
import type { Faq } from "./types.js";

const faqs = faqsData as Faq[];

// El keyword-match que vivía acá (searchFaqs, getFaqsByProducto) se reemplazó por búsqueda
// semántica (ver src/migrate-faqs.ts y agent/tools/search-faqs.ts, ESTADO-PROYECTO.md Paso 5).
// getAllFaqs se queda: sigue siendo la fuente de verdad de los datos crudos, ahora solo
// consumida por el script de migración en vez de por la tool del agente directamente.
export function getAllFaqs(): Faq[] {
  return faqs;
}
