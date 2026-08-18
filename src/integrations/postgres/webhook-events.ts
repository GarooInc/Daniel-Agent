import { getPool } from "./client.js";

// Mismo rol que integrations/mongo/webhook-events.ts: captura cruda de lo que llega al webhook
// genérico, sin asumir schema todavía. El TTL de 30 días que en Mongo era un índice nativo lo
// cubre acá la limpieza periódica de retention.ts (Postgres no tiene TTL indexes).
export async function saveWebhookEvent(
  route: string,
  headers: Record<string, string | string[] | undefined>,
  rawBody: string,
  body: unknown,
  parsed: boolean,
): Promise<void> {
  const pool = await getPool();
  // JSON.stringify explícito, no confiar en que pg serialice el objeto solo: si `body` resulta
  // ser un array en la raíz (un payload JSON válido puede serlo), pg lo trataría como un ARRAY
  // literal de Postgres en vez de JSON — sería el tipo de columna equivocado para `jsonb`.
  await pool.query(
    `INSERT INTO webhook_raw_events (route, received_at, headers, body, raw_body, parsed) VALUES ($1, now(), $2, $3, $4, $5)`,
    [route, JSON.stringify(headers), body === undefined ? null : JSON.stringify(body), rawBody, parsed],
  );
}
