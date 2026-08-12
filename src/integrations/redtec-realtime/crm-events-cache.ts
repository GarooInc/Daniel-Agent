import { getDb } from "../mongo/client.js";

const COLLECTION = "platform_events";

export type PlatformEventType = "lead.created" | "lead.stage_changed" | "appointment.created" | "appointment.cancelled";

type PlatformEventDoc = {
  eventType: PlatformEventType;
  tenantId: string | undefined;
  payload: unknown;
  receivedAt: Date;
};

let indexEnsured = false;

async function ensureIndex(): Promise<void> {
  if (indexEnsured) return;
  const db = await getDb();
  // Preparado para cuando exista un mapeo cliente-de-Slack → tenantId y se construya una tool
  // real que consulte esto filtrando por tenant (ver plan de integración realtime) — nada lee
  // esta colección todavía a propósito, así que no hay riesgo de mezclar datos de distintos
  // tenants en una conversación mientras tanto.
  await db.collection(COLLECTION).createIndex({ tenantId: 1, receivedAt: -1 });
  indexEnsured = true;
}

// Ingesta best-effort de los eventos de CRM del socket de RedTec (lead.*/appointment.*) — se
// persisten tal cual llegan, con su tenantId, para no perder nada mientras no exista un mapeo
// confiable cliente→tenant. Si Mongo falla acá, se propaga el error para que el caller (ver
// client.ts) lo loguee sin cortar la conexión del socket por esto.
export async function recordPlatformEvent(eventType: PlatformEventType, payload: unknown): Promise<void> {
  const db = await getDb();
  await ensureIndex();
  const tenantId = payload && typeof payload === "object" && "tenantId" in payload ? (payload as { tenantId?: string }).tenantId : undefined;
  await db.collection<PlatformEventDoc>(COLLECTION).insertOne({ eventType, tenantId, payload, receivedAt: new Date() });
}
