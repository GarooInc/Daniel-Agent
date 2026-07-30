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
  // $slice en la proyección: que Mongo devuelva solo los últimos `limit`, no los hasta
  // STORED_MESSAGES_CAP guardados, para no traer y descartar en la app lo que no hace falta.
  const doc = await db
    .collection<ChatHistoryDoc>(COLLECTION)
    .findOne({ slackUserId }, { projection: { messages: { $slice: -limit } } });
  if (!doc?.messages) return [];
  return doc.messages.map(({ role, content }) => ({ role, content }));
}

// Timestamp del último mensaje de este cliente, sin importar el contenido — se usa para
// decidir si esta conversación es una continuación o una sesión nueva (ver daniel.ts).
export async function getLastMessageAt(slackUserId: string): Promise<Date | undefined> {
  const db = await getDb();
  const doc = await db
    .collection<ChatHistoryDoc>(COLLECTION)
    .findOne({ slackUserId }, { projection: { messages: { $slice: -1 } } });
  return doc?.messages?.[0]?.createdAt;
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

// Se llama cuando un ticket se crea con éxito: el tema que traía ese historial ya quedó
// resuelto/escalado, así que no debe seguir alimentando la extracción de datos ni el contexto
// del modelo para el próximo mensaje del cliente. Bug real (2026-07-30): sin esto, dos pruebas
// seguidas del mismo usuario dentro de la ventana de sesión (1h) hacían que extractTicketFields
// releyera el intercambio de la escalación ya resuelta y contaminara un ticket nuevo, sobre un
// tema distinto, con el resumen/producto de la conversación anterior.
export async function clearHistory(slackUserId: string): Promise<void> {
  const db = await getDb();
  await db.collection<ChatHistoryDoc>(COLLECTION).deleteOne({ slackUserId });
}
