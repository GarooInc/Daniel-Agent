import { MongoClient, type Db } from "mongodb";
import { env } from "../../config/env.js";

let client: MongoClient | undefined;
let dbPromise: Promise<Db> | undefined;

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        client = new MongoClient(env.mongodbUri ?? "");
        await client.connect();
        const db = client.db(env.mongodbDbName);
        await db.collection("chat_histories").createIndex({ slackUserId: 1 }, { unique: true });
        await db.collection("users").createIndex({ slackUserId: 1 }, { unique: true });
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
