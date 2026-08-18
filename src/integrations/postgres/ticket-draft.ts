import { getPool } from "./client.js";
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

const COLUMNS: Record<keyof TicketDraftFields, string> = {
  nombreCliente: "nombre_cliente",
  email: "email",
  resumen: "resumen",
  urgencia: "urgencia",
  tipoSolicitud: "tipo_solicitud",
  producto: "producto",
  queSeIntentoYa: "que_se_intento_ya",
};

const SELECT_COLUMNS = Object.values(COLUMNS).join(", ");

// El borrador de un ticket en construcción, acumulado entre llamados a escalar_a_monday —
// mismo rol que ticket_drafts en Mongo (ver ese archivo para el porqué: no depender de que el
// modelo recuerde bien datos sueltos del hilo).
export async function getTicketDraft(slackUserId: string): Promise<TicketDraftFields> {
  const pool = await getPool();
  const result = await pool.query<Record<string, string | null>>(
    `SELECT ${SELECT_COLUMNS} FROM ticket_drafts WHERE slack_user_id = $1`,
    [slackUserId],
  );
  const row = result.rows[0];
  if (!row) return {};

  const draft: Record<string, string> = {};
  for (const [field, column] of Object.entries(COLUMNS)) {
    const value = row[column];
    if (value !== null && value !== undefined) draft[field] = value;
  }
  // Los valores vienen de columnas TEXT sin validar contra los enums de UrgenciaTicket/
  // TipoSolicitudTicket/ProductoTicket en runtime — mismo nivel de confianza que la versión
  // Mongo, que tampoco valida el shape del documento leído.
  return draft as TicketDraftFields;
}

export async function saveTicketDraftFields(slackUserId: string, fields: TicketDraftFields): Promise<void> {
  const update: Partial<Record<keyof TicketDraftFields, unknown>> = {};
  for (const key of Object.keys(COLUMNS) as (keyof TicketDraftFields)[]) {
    const value = fields[key];
    if (value !== undefined) update[key] = value;
  }
  if (Object.keys(update).length === 0) return;

  const pool = await getPool();
  const dynamicFields = Object.keys(update) as (keyof TicketDraftFields)[];
  const dbColumns = dynamicFields.map((f) => COLUMNS[f]);
  const values = dynamicFields.map((f) => update[f]);

  const insertColumns = ["slack_user_id", ...dbColumns];
  const placeholders = insertColumns.map((_, i) => `$${i + 1}`);
  const updateSet = [...dbColumns.map((c) => `${c} = EXCLUDED.${c}`), "updated_at = now()"].join(", ");

  // ticket_drafts sí tiene slack_user_id como PK real (a diferencia de customers) — ON CONFLICT
  // directo, sin el UPDATE-luego-INSERT que hace falta en customer-profile.ts.
  await pool.query(
    `INSERT INTO ticket_drafts (${insertColumns.join(", ")}, updated_at)
     VALUES (${placeholders.join(", ")}, now())
     ON CONFLICT (slack_user_id) DO UPDATE SET ${updateSet}`,
    [slackUserId, ...values],
  );
}

export async function clearTicketDraft(slackUserId: string): Promise<void> {
  const pool = await getPool();
  await pool.query(`DELETE FROM ticket_drafts WHERE slack_user_id = $1`, [slackUserId]);
}
