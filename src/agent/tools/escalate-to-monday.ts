import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createSupportTicket } from "../../integrations/monday/index.js";
import { URGENCIA_VALUES, TIPO_SOLICITUD_VALUES, PRODUCTO_VALUES } from "../../integrations/monday/create-ticket.js";
import { notifyEscalation } from "../../integrations/slack/notify-escalation.js";
import { saveCustomerProfile } from "../../integrations/mongo/customer-profile.js";
import { clearHistory } from "../../integrations/mongo/conversation-memory.js";
import { clearTicketDraft, saveTicketDraftFields, type TicketDraftFields } from "../../integrations/mongo/ticket-draft.js";
import { FIELD_LABELS, findMissingFields, mergeTicketFields } from "./ticket-fields.js";
import { logger } from "../../config/logger.js";

// Factory en vez de tool estática: recibe el slackUserId (para guardar el perfil/borrador)
// y el borrador ya calculado por daniel.ts para esta conversación (evita repetir el mismo
// fetch+merge de Mongo que daniel.ts ya hizo momentos antes). Se puede llamar con datos
// parciales o sin argumentos en cualquier momento — si algo falta, lo dice y lo recuerda.
export function createEscalateToMondayTool(slackUserId: string, effectiveDraft: TicketDraftFields) {
  return tool(
    async (args) => {
      try {
        const merged = mergeTicketFields(args, effectiveDraft);
        const missing = findMissingFields(merged);

        if (missing.length > 0) {
          await saveTicketDraftFields(slackUserId, merged);
          return `Guardé estos datos del ticket. Todavía falta: ${missing.map((f) => FIELD_LABELS[f]).join(", ")}. Pedíselo al cliente y volvé a llamar a esta herramienta (no hace falta repetir los datos que ya tengo, solo los nuevos).`;
        }

        const ticket = {
          nombreCliente: merged.nombreCliente!,
          email: merged.email!,
          resumen: merged.resumen!,
          urgencia: merged.urgencia!,
          tipoSolicitud: merged.tipoSolicitud!,
          producto: merged.producto!,
          queSeIntentoYa: merged.queSeIntentoYa || "No especificado",
        };

        const ticketId = await createSupportTicket({ ...ticket, canalOrigen: "slack" });
        logger.info({ ticketId, email: ticket.email }, "Ticket de soporte creado en Monday.com");

        // Best-effort: el ticket en Monday ya quedó creado (fuente de verdad), no vale la
        // pena hacer fallar toda la escalación porque alguna de estas dos falle.
        saveCustomerProfile(slackUserId, { nombreCliente: ticket.nombreCliente, email: ticket.email }).catch((error) => {
          logger.warn({ err: error, slackUserId }, "No se pudo guardar el perfil del cliente");
        });
        clearTicketDraft(slackUserId).catch((error) => {
          logger.warn({ err: error, slackUserId }, "No se pudo limpiar el borrador del ticket");
        });
        clearHistory(slackUserId).catch((error) => {
          logger.warn({ err: error, slackUserId }, "No se pudo limpiar el historial de chat tras la escalación");
        });
        notifyEscalation({ ticketId, ...ticket }).catch((error) => {
          logger.warn({ err: error, ticketId }, "No se pudo notificar el canal de escalación en Slack");
        });

        return `Ticket creado en Monday.com con id ${ticketId}.`;
      } catch (error) {
        logger.error({ err: error }, "Falló la creación del ticket en Monday.com");
        return `No se pudo crear el ticket en Monday.com: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: "escalar_a_monday",
      description:
        "Crea un ticket de soporte en Monday.com cuando Daniel no puede resolver la consulta del cliente directamente. Se puede llamar con datos parciales o incluso SIN argumentos — la herramienta ya tiene guardados los datos que se detectaron en la conversación y te dice qué falta si algo no está. Cuando ya tenga todos los campos requeridos, crea el ticket de verdad de inmediato.",
      schema: z.object({
        nombreCliente: z.string().optional().describe("Nombre del cliente, si ya lo dio"),
        email: z.string().optional().describe("Email del cliente, si ya lo dio"),
        resumen: z.string().optional().describe("Resumen breve del problema o consulta, si ya se conoce"),
        urgencia: z.enum(URGENCIA_VALUES).optional().describe("Urgencia percibida del caso, si ya se evaluó"),
        tipoSolicitud: z.enum(TIPO_SOLICITUD_VALUES).optional().describe("Tipo de solicitud del cliente, si ya se sabe"),
        producto: z.enum(PRODUCTO_VALUES).optional().describe("Producto de RedTec sobre el que trata la consulta, si ya se sabe"),
        queSeIntentoYa: z.string().optional().describe("Qué se intentó resolver antes de escalar, si ya se sabe"),
      }),
    },
  );
}
