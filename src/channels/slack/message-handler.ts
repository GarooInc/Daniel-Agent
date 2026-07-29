import type { App } from "@slack/bolt";
import { askDaniel } from "../../agent/index.js";
import { logger } from "../../config/logger.js";

export function registerMessageHandler(app: App): void {
  app.message(async ({ message, say }) => {
    if (message.subtype) return;
    if (!("text" in message) || !message.text) return;

    try {
      const respuesta = await askDaniel(message.text);
      await say(respuesta);
    } catch (error) {
      logger.error({ err: error }, "Error al consultar a Daniel");
      await say("Tuve un problema para responder tu consulta, ya la voy a escalar a soporte.");
    }
  });
}
