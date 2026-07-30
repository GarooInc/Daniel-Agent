import { getDb } from "./client.js";

export type ConversationRole = "human" | "ai";

export type StoredMessage = {
  role: ConversationRole;
  content: string;
};

type ChatHistoryDoc = {
  slackUserId: string;
  messages: (StoredMessage & { createdAt: Date })[];
  updatedAt: Date;
};

const COLLECTION = "chat_histories";
const HISTORY_LIMIT = 15;
// Tope duro del array guardado en Mongo (más holgado que lo que realmente se manda al
// modelo) para no dejar crecer el documento sin límite, sin perder margen para el futuro.
const STORED_MESSAGES_CAP = 100;

// Un solo documento por usuario de Slack (igual al patrón del nodo de memoria de n8n),
// no una fila por mensaje — el historial vive embebido como array dentro del documento.
export async function getRecentMessages(slackUserId: string, limit = HISTORY_LIMIT): Promise<StoredMessage[]> {
  const db = await getDb();
  const doc = await db.collection<ChatHistoryDoc>(COLLECTION).findOne({ slackUserId });
  if (!doc?.messages) return [];
  return doc.messages.slice(-limit).map(({ role, content }) => ({ role, content }));
}

export async function appendMessage(slackUserId: string, role: ConversationRole, content: string): Promise<void> {
  const db = await getDb();
  await db.collection<ChatHistoryDoc>(COLLECTION).updateOne(
    { slackUserId },
    {
      $push: { messages: { $each: [{ role, content, createdAt: new Date() }], $slice: -STORED_MESSAGES_CAP } },
      $set: { updatedAt: new Date() },
    },
    { upsert: true },
  );
}
