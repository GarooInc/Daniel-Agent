import { getPool } from "./client.js";

export type ConversationRole = "human" | "ai";

export type StoredMessage = {
  role: ConversationRole;
  content: string;
};

const HISTORY_LIMIT = 15;
// Tope duro de filas guardadas por usuario (más holgado que lo que realmente se manda al
// modelo), igual que STORED_MESSAGES_CAP en la versión Mongo — para no dejar crecer la tabla
// sin límite. En Mongo esto era un $slice sobre un array embebido; acá es un DELETE explícito
// de las filas más viejas que las últimas N, corrido en cada appendMessage.
const STORED_MESSAGES_CAP = 100;

// A diferencia de Mongo (un documento por usuario con el historial como array embebido), acá
// cada mensaje es una fila — mismo comportamiento observable (últimos N mensajes de ese
// usuario), más simple de acotar con ORDER BY + LIMIT.
export async function getRecentMessages(slackUserId: string, limit = HISTORY_LIMIT): Promise<StoredMessage[]> {
  const pool = await getPool();
  const result = await pool.query<StoredMessage>(
    `SELECT role, content FROM (
       SELECT role, content, created_at FROM chat_messages WHERE slack_user_id = $1 ORDER BY created_at DESC LIMIT $2
     ) recientes ORDER BY created_at ASC`,
    [slackUserId, limit],
  );
  return result.rows;
}

// Timestamp del último mensaje de este cliente, sin importar el contenido — se usa para
// decidir si esta conversación es una continuación o una sesión nueva (ver daniel.ts).
export async function getLastMessageAt(slackUserId: string): Promise<Date | undefined> {
  const pool = await getPool();
  const result = await pool.query<{ created_at: Date }>(
    `SELECT created_at FROM chat_messages WHERE slack_user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [slackUserId],
  );
  return result.rows[0]?.created_at;
}

export async function appendMessage(slackUserId: string, role: ConversationRole, content: string): Promise<void> {
  const pool = await getPool();
  await pool.query(`INSERT INTO chat_messages (slack_user_id, role, content) VALUES ($1, $2, $3)`, [slackUserId, role, content]);
  await pool.query(
    `DELETE FROM chat_messages
     WHERE slack_user_id = $1
       AND id NOT IN (SELECT id FROM chat_messages WHERE slack_user_id = $1 ORDER BY created_at DESC LIMIT $2)`,
    [slackUserId, STORED_MESSAGES_CAP],
  );
}

// Se llama cuando un ticket se crea con éxito o al detectar una sesión nueva — mismo rol que
// clearHistory() en la versión Mongo (ver ese archivo para el detalle del bug real que motivó
// esto: sin limpiar, el historial de un tema ya resuelto se filtraba al siguiente mensaje).
export async function clearHistory(slackUserId: string): Promise<void> {
  const pool = await getPool();
  await pool.query(`DELETE FROM chat_messages WHERE slack_user_id = $1`, [slackUserId]);
}
