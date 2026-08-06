import "dotenv/config";
import { getAllFaqs } from "./knowledge-base/index.js";
import { embedTexts } from "./integrations/embeddings/openrouter-embeddings.js";
import { ensureFaqVectorIndex, upsertFaqDocument } from "./integrations/mongo/documents.js";
import { closeMongo } from "./integrations/mongo/client.js";

// Migra las FAQs de data/faqs.json a la colección `documents` en Mongo, con su embedding
// (OpenRouter, openai/text-embedding-3-small) para poder reemplazar el keyword-match de
// knowledge-base/faqs.ts por búsqueda semántica (ver ESTADO-PROYECTO.md, Paso 5). Idempotente:
// se puede correr de nuevo (por ejemplo, tras editar faqs.json) — hace upsert por `id`, no
// duplica documentos.
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

  console.log("Listo. El índice puede tardar unos minutos en quedar READY en Atlas antes de poder buscarse.");
  await closeMongo();
}

main().catch((error) => {
  console.error("Falló la migración:", error);
  process.exitCode = 1;
});
