import { getPool } from "../postgres/client.js";

export type PlatformEventType = "lead.created" | "lead.stage_changed" | "appointment.created" | "appointment.cancelled";

// Ingesta best-effort de los eventos de CRM del socket de RedTec (lead.*/appointment.*) — se
// persisten tal cual llegan, con su tenantId, para no perder nada mientras no exista un mapeo
// confiable cliente→tenant. Si Postgres falla acá, se propaga el error para que el caller (ver
// client.ts) lo loguee sin cortar la conexión del socket por esto. El índice sobre
// (tenant_id, received_at) ya se crea de forma estática en integrations/postgres/schema.ts —
// a diferencia de Mongo, acá no hace falta crearlo perezosamente en el primer insert.
export async function recordPlatformEvent(eventType: PlatformEventType, payload: unknown): Promise<void> {
  const pool = await getPool();
  const tenantId = payload && typeof payload === "object" && "tenantId" in payload ? (payload as { tenantId?: string }).tenantId : undefined;
  await pool.query(`INSERT INTO platform_events (event_type, tenant_id, payload, received_at) VALUES ($1, $2, $3, now())`, [
    eventType,
    tenantId ?? null,
    JSON.stringify(payload),
  ]);
}
