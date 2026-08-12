import { MongoClient, type Db } from "mongodb";
import { env } from "../../config/env.js";

let client: MongoClient | undefined;
let dbPromise: Promise<Db> | undefined;

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        // serverSelectionTimeoutMS más largo que el default (30s) — bug real en vivo
        // (2026-08-06): el primer mensaje de un cliente después de cada redeploy fallaba con
        // "Server selection timed out after 30000 ms" (el driver no llegaba a descubrir el
        // primary del replica set a tiempo en un contenedor recién arrancado), tumbando toda
        // la respuesta y disparando una auto-escalación con datos genéricos. Ver también el
        // "calentamiento" en bot.ts, que llama a getDb() al arrancar para que ese costo lo
        // pague el arranque del contenedor, no el primer cliente real.
        client = new MongoClient(env.mongodbUri ?? "", { serverSelectionTimeoutMS: 45_000 });
        await client.connect();
        const db = client.db(env.mongodbDbName);
        await db.collection("chat_histories").createIndex({ slackUserId: 1 }, { unique: true });
        // `customers` (antes `users`, ver plans/2026-08-12-estructura-datos-clientes-e-ingesta-externa.md):
        // email es la clave canónica una vez conocida, pero no todo documento la tiene todavía
        // (un cliente nuevo por Slack antes de dar su email) — sparse para no romper el índice
        // único con múltiples documentos sin ese campo. slackUserId no es único a nivel de
        // índice: customer-profile.ts se encarga de no dejar dos documentos con el mismo
        // slackUserId cuando se resuelve por email.
        await db.collection("customers").createIndex({ email: 1 }, { unique: true, sparse: true });
        await db.collection("customers").createIndex({ slackUserId: 1 }, { sparse: true });
        await db.collection("ticket_drafts").createIndex({ slackUserId: 1 }, { unique: true });
        return db;
      } catch (error) {
        dbPromise = undefined;
        client = undefined;
        throw error;
      }
    })();
  }
  return dbPromise;
}

// Para scripts de un solo uso (migraciones, tests) que necesitan cerrar la conexión prolijo
// y dejar que el proceso termine solo, en vez de quedar colgado esperando el socket abierto.
// El bot en producción nunca la llama — vive corriendo, no hace falta cerrar nada ahí.
export async function closeMongo(): Promise<void> {
  await client?.close();
  client = undefined;
  dbPromise = undefined;
}
