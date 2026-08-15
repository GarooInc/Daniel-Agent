import type { WebClient } from "@slack/web-api";
import { extractTechDiagnosis } from "./extract-tech-diagnosis.js";
import { markHandoffAnswered, type TechAgentHandoffDoc } from "../integrations/mongo/tech-agent-handoff.js";
import { appendMessage } from "../integrations/mongo/conversation-memory.js";
import { addTicketUpdate, markTicketReady } from "../integrations/monday/index.js";
import { toSlackMrkdwn } from "../channels/slack/format.js";
import { logger } from "../config/logger.js";

// No se reinvoca askDaniel() completo — sería un tool-loop innecesario sobre una respuesta ya
// determinística (ver plans/2026-08-12-agente-tecnico-n8n-spectrum.md, sección A.4).
export async function deliverTechDiagnosis(client: WebClient, handoff: TechAgentHandoffDoc, mensajeAgenteTecnico: string): Promise<void> {
  const diagnosis = await extractTechDiagnosis(mensajeAgenteTecnico);
  await markHandoffAnswered(handoff.threadTs, mensajeAgenteTecnico, diagnosis.causaRaiz, diagnosis.componenteAfectado);

  const mensajeFinal = diagnosis.resuelto
    ? `Nuestro equipo técnico revisó tu caso: ${diagnosis.resumenParaCliente}`
    : `Nuestro equipo técnico está investigando tu caso. Por ahora: ${diagnosis.resumenParaCliente}`;

  await client.chat.postMessage({ channel: handoff.originalChannelId, text: toSlackMrkdwn(mensajeFinal) });

  await appendMessage(handoff.originalSlackUserId, "ai", mensajeFinal).catch((err) => {
    logger.warn({ err }, "No se pudo guardar en el historial el mensaje de diagnóstico entregado al cliente");
  });

  // Deja el diagnóstico visible en el ticket real de Monday, no solo en Slack — para que
  // alguien del equipo de soporte que nunca mira el canal privado del cliente igual vea qué
  // encontró el Técnico (sección E del plan, pedido de Jorge 2026-08-15). Best-effort: el
  // cliente ya recibió su respuesta arriba, no hace falta que esto bloquee ni la haga fallar.
  addTicketUpdate(handoff.mondayItemId, `Diagnóstico del equipo técnico:\n\n${mensajeAgenteTecnico}`).catch((err) => {
    logger.warn({ err, mondayItemId: handoff.mondayItemId }, "No se pudo agregar el diagnóstico al ticket de Monday");
  });
  if (diagnosis.resuelto) {
    markTicketReady(handoff.mondayItemId).catch((err) => {
      logger.warn({ err, mondayItemId: handoff.mondayItemId }, "No se pudo marcar el ticket como Listo en Monday");
    });
  }
}
