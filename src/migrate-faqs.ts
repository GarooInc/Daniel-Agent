import "dotenv/config";
import { getAllFaqs } from "./knowledge-base/index.js";
import { embedTexts } from "./integrations/embeddings/openrouter-embeddings.js";
import { ensureFaqVectorIndex, upsertFaqDocument } from "./integrations/postgres/documents.js";
import { closePostgres } from "./integrations/postgres/client.js";

// Migra las FAQs de data/faqs.json a la tabla `documents` en Postgres (pgvector), con su
// embedding (OpenRouter, openai/text-embedding-3-small) para la búsqueda semántica de
// knowledge-base/faqs.ts (ver ESTADO-PROYECTO.md, Paso 5 y Pendiente #17 — migrado de Mongo a
// Postgres). Idempotente: se puede correr de nuevo (por ejemplo, tras editar faqs.json) — hace
// upsert por `id`, no duplica documentos.
async function main() {
  const faqs = getAllFaqs();
  console.log(`Migrando ${faqs.length} FAQs a la colección "documents"...`);

  const textos = faqs.map((faq) => `${faq.pregunta}\n\n${faq.respuesta}`);
  const embeddings = await embedTexts(textos);

  for (const [i, faq] of faqs.entries()) {
    await upsertFaqDocument(faq, embeddings[i]);
    console.log(`  [${i + 1}/${faqs.length}] ${faq.id}`);
  }

  console.log("Creando el índice de vector search (si no existe todavía)...");
  await ensureFaqVectorIndex();

  console.log("Listo.");
  await closePostgres();
}

main().catch((error) => {
  console.error("Falló la migración:", error);
  process.exitCode = 1;
});
