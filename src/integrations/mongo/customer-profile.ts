import { getDb } from "./client.js";

export type CustomerProfile = {
  nombreCliente?: string;
  email?: string;
};

type CustomerProfileDoc = CustomerProfile & { slackUserId: string; updatedAt: Date };

const COLLECTION = "users";

// Identidad del cliente (nombre/email) persistida por su Slack user_id, para no
// volver a pedirla en conversaciones futuras aunque haya pasado mucho tiempo o
// se haya perdido el historial de chat (chat_histories tiene sus propios 15 mensajes).
export async function getCustomerProfile(slackUserId: string): Promise<CustomerProfile | null> {
  const db = await getDb();
  const doc = await db.collection<CustomerProfileDoc>(COLLECTION).findOne({ slackUserId });
  if (!doc) return null;
  return { nombreCliente: doc.nombreCliente, email: doc.email };
}

export async function saveCustomerProfile(slackUserId: string, profile: CustomerProfile): Promise<void> {
  const update: Record<string, string> = {};
  if (profile.nombreCliente) update.nombreCliente = profile.nombreCliente;
  if (profile.email) update.email = profile.email;
  if (Object.keys(update).length === 0) return;

  const db = await getDb();
  await db
    .collection<CustomerProfileDoc>(COLLECTION)
    .updateOne({ slackUserId }, { $set: { ...update, updatedAt: new Date() } }, { upsert: true });
}
