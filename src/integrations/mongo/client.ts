import { MongoClient, type Db } from "mongodb";
import { env } from "../../config/env.js";

let dbPromise: Promise<Db> | undefined;

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const client = new MongoClient(env.mongodbUri ?? "");
      await client.connect();
      const db = client.db(env.mongodbDbName);
      await db.collection("chat_histories").createIndex({ slackUserId: 1 }, { unique: true });
      await db.collection("users").createIndex({ slackUserId: 1 }, { unique: true });
      await db.collection("ticket_drafts").createIndex({ slackUserId: 1 }, { unique: true });
      return db;
    })();
  }
  return dbPromise;
}
