import "dotenv/config";
import { embedText } from "./integrations/embeddings/openrouter-embeddings.js";
import { searchFaqsBySimilarity as searchMongo } from "./integrations/mongo/documents.js";
import { searchFaqsBySimilarity as searchPostgres } from "./integrations/postgres/documents.js";
import { closeMongo } from "./integrations/mongo/client.js";
import { closePostgres } from "./integrations/postgres/client.js";

// Herramienta de un solo uso para recalibrar MIN_SCORE de agent/tools/search-faqs.ts sobre
// pgvector (ver plans/2026-08-18-migracion-postgresql-pgvector.md, "detalle a resolver, no
// bloqueante", y ESTADO-PROYECTO.md punto 17). El score de Atlas ($vectorSearchScore) y
// `1 - cosine_distance` de pgvector no son la misma escala numérica — MIN_SCORE = 0.72 está
// calibrado solo para Atlas.
//
// Requiere que `documents` ya esté poblada en AMBAS bases (correr antes `npm run migrate:faqs`
// para Mongo y `npm run migrate:mongo-to-postgres` para Postgres). Pensado para correrse por
// SSH en el VPS, donde ambas bases son alcanzables — no funciona desde esta máquina de
// desarrollo (Postgres no tiene puerto público expuesto).
//
// No decide el nuevo MIN_SCORE por vos: imprime, lado a lado, el score de Mongo (ya calibrado,
// de referencia) y el de Postgres para el mismo texto embebido, en preguntas "reales"
// (paráfrasis de FAQs existentes — deberían dar un match fuerte con la FAQ que las originó) y
// preguntas "irrelevantes" (control — no deberían pasar ningún umbral razonable). Con esos dos
// grupos separados alcanza para elegir un MIN_SCORE nuevo para Postgres con el mismo margen que
// tiene 0.72 hoy sobre Atlas (ver comentario en search-faqs.ts: "un match real da ~0.76-0.83 y
// una consulta irrelevante no pasa de ~0.68").

type CasoDePrueba = { query: string; producto?: string; esperado: "match" | "irrelevante" };

const CASOS: CasoDePrueba[] = [
  // Paráfrasis de FAQs reales (ver data/faqs.json) — se espera score alto contra la FAQ real.
  { query: "¿cómo hace Isabella para agendar una reunión con un lead interesado?", producto: "Isabella", esperado: "match" },
  { query: "necesito conectar mi Google Calendar a Isabella, ¿cómo hago?", producto: "Isabella", esperado: "match" },
  { query: "¿Isabella etiqueta a los leads según qué tan interesados están?", producto: "Isabella", esperado: "match" },
  { query: "¿qué tipo de posts o contenido puede armar Sofi para redes?", producto: "Sofi", esperado: "match" },
  { query: "¿Sofi publica solo o alguien tiene que aprobar antes?", producto: "Sofi", esperado: "match" },
  { query: "quiero que Sofi escriba con un tono más cercano, ¿se puede configurar?", producto: "Sofi", esperado: "match" },
  { query: "¿dónde pego el código del widget en mi página?", producto: "widget-chatbot", esperado: "match" },
  { query: "¿el widget se ve bien desde el celular?", producto: "widget-chatbot", esperado: "match" },
  { query: "si el widget no sabe responder algo, ¿qué pasa con esa consulta?", producto: "widget-chatbot", esperado: "match" },
  // Controles irrelevantes — no deberían dar un match fuerte con ninguna FAQ.
  { query: "¿cuál es la capital de Francia?", esperado: "irrelevante" },
  { query: "quiero hablar con una persona, no con un bot", esperado: "irrelevante" },
  { query: "¿qué tiempo hace hoy?", producto: "Isabella", esperado: "irrelevante" },
];

async function main() {
  console.log("Recalibración MIN_SCORE — Mongo (referencia, 0.72) vs Postgres (pgvector)\n");
  console.log(
    ["esperado", "producto", "query", "score_mongo", "top_mongo_id", "score_postgres", "top_postgres_id"].join(" | "),
  );

  for (const caso of CASOS) {
    const textoAEmbeber = caso.producto ? `${caso.producto}: ${caso.query}` : caso.query;
    const queryEmbedding = await embedText(textoAEmbeber);

    const [mongoResults, postgresResults] = await Promise.all([
      searchMongo(queryEmbedding, { producto: caso.producto, limit: 1 }),
      searchPostgres(queryEmbedding, { producto: caso.producto, limit: 1 }),
    ]);

    const topMongo = mongoResults[0];
    const topPostgres = postgresResults[0];

    console.log(
      [
        caso.esperado,
        caso.producto ?? "(sin filtro)",
        JSON.stringify(caso.query),
        topMongo ? topMongo.score.toFixed(4) : "(sin resultados)",
        topMongo?.id ?? "-",
        topPostgres ? topPostgres.score.toFixed(4) : "(sin resultados)",
        topPostgres?.id ?? "-",
      ].join(" | "),
    );
  }

  console.log(
    "\nElegí MIN_SCORE para Postgres (en agent/tools/search-faqs.ts, hoy calibrado a 0.72 solo para Mongo) " +
      "por encima del score_postgres más alto de la fila 'irrelevante' y por debajo del más bajo de las filas 'match', " +
      "mismo criterio con el que se calibró 0.72 el 2026-08-06.",
  );

  await closeMongo();
  await closePostgres();
}

main().catch((error) => {
  console.error("Falló la recalibración:", error);
  process.exitCode = 1;
});
