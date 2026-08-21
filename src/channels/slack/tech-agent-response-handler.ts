import type { App } from "@slack/bolt";
import { findPendingHandoffByThreadTs } from "../../integrations/postgres/tech-agent-handoff.js";
import { deliverTechDiagnosis } from "../../agent/deliver-tech-diagnosis.js";
import { wasAlreadyProcessed } from "./dedupe.js";
import { logger } from "../../config/logger.js";

// Reemplaza el mecanismo de correlación por webhook de A.3/A.4 (superseded, ver
// plans/2026-08-12-agente-tecnico-n8n-spectrum.md, sección E.2): la comunicación Daniel↔Agente
// Técnico es 100% por Slack. El Técnico puede narrar su proceso libremente en el hilo del
// handoff (visible para humanos en su canal privado, ver config/tech-agents.ts) — la señal
// inequívoca de "esto es el diagnóstico final" es que mencione explícitamente a Daniel en ese
// mensaje. No filtra por canal: threadTs ya es una clave de correlación única en
// tech_agent_handoffs, así que no hace falta resolver a qué cliente pertenece el canal acá.
export function registerTechAgentResponseHandler(app: App, danielBotUserId: string): void {
  const mentionTag = `<@${danielBotUserId}>`;

  app.message(async ({ message, client }) => {
    if (message.subtype) return;
    if (!("text" in message) || !message.text) return;
    if (!("thread_ts" in message) || !message.thread_ts) return;
    if (!message.text.includes(mentionTag)) return;

    const eventId = "client_msg_id" in message ? message.client_msg_id : undefined;
    if (eventId && wasAlreadyProcessed(eventId)) return;

    try {
      const handoff = await findPendingHandoffByThreadTs(message.thread_ts);
      if (!handoff) return; // no corresponde a un handoff nuestro, o ya se resolvió/expiró

      await deliverTechDiagnosis(client, handoff, message.text);
    } catch (error) {
      logger.error({ err: error, threadTs: message.thread_ts }, "Error al procesar la respuesta del Agente Técnico");
    }
  });
}
