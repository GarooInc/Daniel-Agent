import { getDb } from "./client.js";
import type { ProductoTicket, TipoSolicitudTicket, UrgenciaTicket } from "../monday/create-ticket.js";

export type TicketDraftFields = {
  nombreCliente?: string;
  email?: string;
  resumen?: string;
  urgencia?: UrgenciaTicket;
  tipoSolicitud?: TipoSolicitudTicket;
  producto?: ProductoTicket;
  queSeIntentoYa?: string;
};

type TicketDraftDoc = TicketDraftFields & { slackUserId: string; updatedAt: Date };

const COLLECTION = "ticket_drafts";

// El borrador de un ticket en construcción, acumulado entre llamados a escalar_a_monday.
// Existe para no depender de que el modelo recuerde bien datos sueltos del hilo (en pruebas
// en vivo no lo hacía de forma confiable) — la propia herramienta hace de memoria del ticket.
export async function getTicketDraft(slackUserId: string): Promise<TicketDraftFields> {
  const db = await getDb();
  const doc = await db.collection<TicketDraftDoc>(COLLECTION).findOne({ slackUserId });
  if (!doc) return {};
  const { nombreCliente, email, resumen, urgencia, tipoSolicitud, producto, queSeIntentoYa } = doc;
  return { nombreCliente, email, resumen, urgencia, tipoSolicitud, producto, queSeIntentoYa };
}

export async function saveTicketDraftFields(slackUserId: string, fields: TicketDraftFields): Promise<void> {
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) update[key] = value;
  }
  if (Object.keys(update).length === 0) return;

  const db = await getDb();
  await db
    .collection<TicketDraftDoc>(COLLECTION)
    .updateOne({ slackUserId }, { $set: { ...update, updatedAt: new Date() } }, { upsert: true });
}

export async function clearTicketDraft(slackUserId: string): Promise<void> {
  const db = await getDb();
  await db.collection<TicketDraftDoc>(COLLECTION).deleteOne({ slackUserId });
}
