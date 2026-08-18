import { getPool } from "./client.js";

export type TicketConversationDoc = {
  mondayItemId: string;
  slackUserId: string;
  channelId: string;
  createdAt: Date;
};

// Correlación mondayItemId -> conversación de Slack que lo generó, igual que la versión Mongo
// (ver ese archivo para el porqué: un sistema externo que avise "este ticket cambió de estado"
// necesita saber a qué cliente/canal avisarle). No se limpia nunca automáticamente — un ticket
// puede tardar días en resolverse.
export async function saveTicketConversation(mondayItemId: string, slackUserId: string, channelId: string): Promise<void> {
  const pool = await getPool();
  await pool.query(
    `INSERT INTO ticket_conversations (monday_item_id, slack_user_id, channel_id, created_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (monday_item_id) DO UPDATE SET
       slack_user_id = EXCLUDED.slack_user_id,
       channel_id = EXCLUDED.channel_id,
       created_at = now()`,
    [mondayItemId, slackUserId, channelId],
  );
}

export async function findTicketConversation(mondayItemId: string): Promise<TicketConversationDoc | null> {
  const pool = await getPool();
  const result = await pool.query<{ monday_item_id: string; slack_user_id: string; channel_id: string; created_at: Date }>(
    `SELECT monday_item_id, slack_user_id, channel_id, created_at FROM ticket_conversations WHERE monday_item_id = $1`,
    [mondayItemId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { mondayItemId: row.monday_item_id, slackUserId: row.slack_user_id, channelId: row.channel_id, createdAt: row.created_at };
}
