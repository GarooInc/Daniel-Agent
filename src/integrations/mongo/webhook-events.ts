import { getDb } from "./client.js";

type WebhookEventDoc = {
  route: string;
  receivedAt: Date;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  rawBody: string;
  parsed: boolean;
};

const COLLECTION = "webhook_raw_events";
// Convención decidida para toda ingesta cruda de sistemas externos (ver
// plans/2026-08-12-estructura-datos-clientes-e-ingesta-externa.md): TTL default de 30 días.
// Sin esto la colección crecía sin límite desde 2026-08-11 — es solo para auditar/reprocesar
// mientras se define el schema real, no hace falta guardarla para siempre.
const RETENTION_DAYS = 30;

let indexEnsured = false;

async function ensureRetentionIndex(): Promise<void> {
  if (indexEnsured) return;
  const db = await getDb();
  await db.collection(COLLECTION).createIndex({ receivedAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 });
  indexEnsured = true;
}

export async function saveWebhookEvent(
  route: string,
  headers: Record<string, string | string[] | undefined>,
  rawBody: string,
  body: unknown,
  parsed: boolean,
): Promise<void> {
  const db = await getDb();
  await ensureRetentionIndex();
  await db.collection<WebhookEventDoc>(COLLECTION).insertOne({
    route,
    receivedAt: new Date(),
    headers,
    body,
    rawBody,
    parsed,
  });
}
