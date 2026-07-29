import type { App } from "@slack/bolt";
import { askDaniel } from "../../agent/index.js";
import { logger } from "../../config/logger.js";

const PROCESSED_EVENT_TTL_MS = 60_000;
const processedEvents = new Map<string, number>();

function alreadyProcessed(eventId: string): boolean {
  const now = Date.now();
  for (const [id, seenAt] of processedEvents) {
    if (now - seenAt > PROCESSED_EVENT_TTL_MS) processedEvents.delete(id);
  }

  if (processedEvents.has(eventId)) return true;
  processedEvents.set(eventId, now);
  return false;
}

export function registerMessageHandler(app: App): void {
  app.message(async ({ message, say }) => {
    if (message.subtype) return;
    if (!("text" in message) || !message.text) return;

    // Slack Events API puede reenviar el mismo mensaje si no se acusa recibo a tiempo
    // (askDaniel + la tool de Monday pueden tardar más de los ~3s que Slack espera).
    const eventId = "client_msg_id" in message ? message.client_msg_id : undefined;
    if (eventId && alreadyProcessed(eventId)) {
      logger.warn({ eventId }, "Mensaje duplicado de Slack ignorado");
      return;
    }

    try {
      const respuesta = await askDaniel(message.text);
      await say(respuesta);
    } catch (error) {
      logger.error({ err: error }, "Error al consultar a Daniel");
      await say("Tuve un problema para responder tu consulta, ya la voy a escalar a soporte.");
    }
  });
}
