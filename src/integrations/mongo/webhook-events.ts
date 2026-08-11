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

export async function saveWebhookEvent(
  route: string,
  headers: Record<string, string | string[] | undefined>,
  rawBody: string,
  body: unknown,
  parsed: boolean,
): Promise<void> {
  const db = await getDb();
  await db.collection<WebhookEventDoc>(COLLECTION).insertOne({
    route,
    receivedAt: new Date(),
    headers,
    body,
    rawBody,
    parsed,
  });
}
