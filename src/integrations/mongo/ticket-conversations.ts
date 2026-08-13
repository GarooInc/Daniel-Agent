import { getDb } from "./client.js";

export type TicketConversationDoc = {
  mondayItemId: string;
  slackUserId: string;
  channelId: string;
  createdAt: Date;
};

const COLLECTION = "ticket_conversations";

// Correlación mondayItemId -> conversación de Slack que lo generó. Sin esto, un sistema externo
// que avise "este ticket cambió de estado" (ver ESTADO-PROYECTO.md, pendiente #13, 2026-08-13)
// no tiene forma de saber a qué cliente/canal avisarle — el item ID de Monday se usaba una sola
// vez (log + aviso a #escalacion) y se perdía. A diferencia de ticket_drafts, esto no se limpia
// nunca automáticamente: un ticket puede tardar días en resolverse y la correlación tiene que
// sobrevivir todo ese tiempo.
export async function saveTicketConversation(mondayItemId: string, slackUserId: string, channelId: string): Promise<void> {
  const db = await getDb();
  await db.collection<TicketConversationDoc>(COLLECTION).updateOne(
    { mondayItemId },
    { $set: { mondayItemId, slackUserId, channelId, createdAt: new Date() } },
    { upsert: true },
  );
}

export async function findTicketConversation(mondayItemId: string): Promise<TicketConversationDoc | null> {
  const db = await getDb();
  return db.collection<TicketConversationDoc>(COLLECTION).findOne({ mondayItemId });
}
