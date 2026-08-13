import { getDb } from "./client.js";

export type TechAgentHandoffStatus = "pending" | "answered" | "timeout";

export type TechAgentHandoffDoc = {
  threadTs: string; // ts del mensaje que Daniel posteó en el canal compartido — clave de correlación
  sharedChannelId: string;
  originalSlackUserId: string; // cliente (ej. Spectrum)
  originalChannelId: string; // DM o canal donde responderle al cliente
  resumenProblema: string;
  status: TechAgentHandoffStatus;
  causaRaiz?: string;
  componenteAfectado?: string;
  respuestaCruda?: string;
  createdAt: Date;
  answeredAt?: Date;
};

const COLLECTION = "tech_agent_handoffs";

// Handoff de un diagnóstico delegado al Agente Técnico (ver
// plans/2026-08-12-agente-tecnico-n8n-spectrum.md, sección A.2). threadTs es la única query
// real de esta colección — es lo que un handler futuro (A.3, todavía sin construir) usará para
// ubicar a qué conversación de cliente corresponde la respuesta que llegue en ese hilo.
export async function createHandoff(fields: Omit<TechAgentHandoffDoc, "status" | "createdAt">): Promise<void> {
  const db = await getDb();
  await db.collection<TechAgentHandoffDoc>(COLLECTION).insertOne({
    ...fields,
    status: "pending",
    createdAt: new Date(),
  });
}

export async function findPendingHandoffByThreadTs(threadTs: string): Promise<TechAgentHandoffDoc | null> {
  const db = await getDb();
  return db.collection<TechAgentHandoffDoc>(COLLECTION).findOne({ threadTs, status: "pending" });
}

export async function markHandoffAnswered(
  threadTs: string,
  respuestaCruda: string,
  causaRaiz?: string,
  componenteAfectado?: string,
): Promise<void> {
  const db = await getDb();
  const update: Record<string, unknown> = { status: "answered", respuestaCruda, answeredAt: new Date() };
  if (causaRaiz !== undefined) update.causaRaiz = causaRaiz;
  if (componenteAfectado !== undefined) update.componenteAfectado = componenteAfectado;
  await db.collection<TechAgentHandoffDoc>(COLLECTION).updateOne({ threadTs }, { $set: update });
}

export async function markHandoffTimeout(threadTs: string): Promise<void> {
  const db = await getDb();
  await db.collection<TechAgentHandoffDoc>(COLLECTION).updateOne({ threadTs, status: "pending" }, { $set: { status: "timeout" } });
}
