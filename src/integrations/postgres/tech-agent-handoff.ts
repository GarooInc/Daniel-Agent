import { getPool } from "./client.js";

export type TechAgentHandoffStatus = "pending" | "answered" | "timeout";

export type TechAgentHandoffDoc = {
  threadTs: string; // ts del mensaje que Daniel posteó en el canal compartido — clave de correlación
  sharedChannelId: string;
  originalSlackUserId: string; // cliente (ej. Spectrum)
  originalChannelId: string; // DM o canal donde responderle al cliente
  resumenProblema: string;
  mondayItemId: string; // ticket real que originó esta consulta — ver agent/deliver-tech-diagnosis.ts
  status: TechAgentHandoffStatus;
  causaRaiz?: string;
  componenteAfectado?: string;
  respuestaCruda?: string;
  createdAt: Date;
  answeredAt?: Date;
};

type HandoffRow = {
  thread_ts: string;
  shared_channel_id: string;
  original_slack_user_id: string;
  original_channel_id: string;
  resumen_problema: string;
  monday_item_id: string;
  status: TechAgentHandoffStatus;
  causa_raiz: string | null;
  componente_afectado: string | null;
  respuesta_cruda: string | null;
  created_at: Date;
  answered_at: Date | null;
};

function rowToHandoff(row: HandoffRow): TechAgentHandoffDoc {
  return {
    threadTs: row.thread_ts,
    sharedChannelId: row.shared_channel_id,
    originalSlackUserId: row.original_slack_user_id,
    originalChannelId: row.original_channel_id,
    resumenProblema: row.resumen_problema,
    mondayItemId: row.monday_item_id,
    status: row.status,
    causaRaiz: row.causa_raiz ?? undefined,
    componenteAfectado: row.componente_afectado ?? undefined,
    respuestaCruda: row.respuesta_cruda ?? undefined,
    createdAt: row.created_at,
    answeredAt: row.answered_at ?? undefined,
  };
}

// Handoff de un diagnóstico delegado al Agente Técnico, misma semántica que la versión Mongo
// (ver ese archivo — se crea determinísticamente al escalar un ticket para un cliente con
// Agente Técnico configurado).
export async function createHandoff(fields: Omit<TechAgentHandoffDoc, "status" | "createdAt">): Promise<void> {
  const pool = await getPool();
  await pool.query(
    `INSERT INTO tech_agent_handoffs
       (thread_ts, shared_channel_id, original_slack_user_id, original_channel_id, resumen_problema, monday_item_id, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', now())`,
    [fields.threadTs, fields.sharedChannelId, fields.originalSlackUserId, fields.originalChannelId, fields.resumenProblema, fields.mondayItemId],
  );
}

export async function findPendingHandoffByThreadTs(threadTs: string): Promise<TechAgentHandoffDoc | null> {
  const pool = await getPool();
  const result = await pool.query<HandoffRow>(`SELECT * FROM tech_agent_handoffs WHERE thread_ts = $1 AND status = 'pending'`, [threadTs]);
  const row = result.rows[0];
  return row ? rowToHandoff(row) : null;
}

export async function markHandoffAnswered(
  threadTs: string,
  respuestaCruda: string,
  causaRaiz?: string,
  componenteAfectado?: string,
): Promise<void> {
  const pool = await getPool();
  // COALESCE con el valor ya guardado si no vino el parámetro: mismo comportamiento que el
  // update parcial de Mongo ("solo pisar causaRaiz/componenteAfectado si vinieron definidos").
  await pool.query(
    `UPDATE tech_agent_handoffs
     SET status = 'answered', respuesta_cruda = $2, answered_at = now(),
         causa_raiz = COALESCE($3, causa_raiz),
         componente_afectado = COALESCE($4, componente_afectado)
     WHERE thread_ts = $1`,
    [threadTs, respuestaCruda, causaRaiz ?? null, componenteAfectado ?? null],
  );
}

export async function markHandoffTimeout(threadTs: string): Promise<void> {
  const pool = await getPool();
  await pool.query(`UPDATE tech_agent_handoffs SET status = 'timeout' WHERE thread_ts = $1 AND status = 'pending'`, [threadTs]);
}
