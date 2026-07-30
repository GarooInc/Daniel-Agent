import { getDb } from "./client.js";

export type ConversationRole = "human" | "ai";

export type StoredMessage = {
  role: ConversationRole;
  content: string;
};

type ConversationDoc = StoredMessage & { slackUserId: string; createdAt: Date };

const COLLECTION = "chat_histories";
const HISTORY_LIMIT = 15;

// Memoria tipo "buffer window" (igual a la memoria simple de n8n): últimos N mensajes
// por usuario de Slack, sin importar cuánto tiempo pasó desde el último. No usa
// embeddings/búsqueda semántica — para v1 alcanza con recencia, no con similitud.
export async function getRecentMessages(slackUserId: string, limit = HISTORY_LIMIT): Promise<StoredMessage[]> {
  const db = await getDb();
  const docs = await db
    .collection<ConversationDoc>(COLLECTION)
    .find({ slackUserId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.reverse().map(({ role, content }) => ({ role, content }));
}

export async function appendMessage(slackUserId: string, role: ConversationRole, content: string): Promise<void> {
  const db = await getDb();
  await db.collection<ConversationDoc>(COLLECTION).insertOne({ slackUserId, role, content, createdAt: new Date() });
}
