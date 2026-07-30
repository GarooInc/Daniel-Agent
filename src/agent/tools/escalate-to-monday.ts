import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createSupportTicket } from "../../integrations/monday/index.js";
import { notifyEscalation } from "../../integrations/slack/notify-escalation.js";
import { saveCustomerProfile } from "../../integrations/mongo/customer-profile.js";
import { logger } from "../../config/logger.js";

// Factory en vez de tool estática: necesita el slackUserId de quien escribe para poder
// guardar su nombre/email en el perfil (colección `users`) una vez que los da.
export function createEscalateToMondayTool(slackUserId: string) {
  return tool(
    async ({ nombreCliente, email, resumen, urgencia, tipoSolicitud, producto, queSeIntentoYa }) => {
      try {
        const ticketId = await createSupportTicket({
          nombreCliente,
          email,
          resumen,
          urgencia,
          tipoSolicitud,
          producto,
          canalOrigen: "slack",
          queSeIntentoYa,
        });
        logger.info({ ticketId, email }, "Ticket de soporte creado en Monday.com");

        // Ambos best-effort: si fallan, el ticket en Monday ya quedó creado (fuente de verdad),
        // no vale la pena hacer fallar toda la escalación por esto.
        saveCustomerProfile(slackUserId, { nombreCliente, email }).catch((error) => {
          logger.warn({ err: error, slackUserId }, "No se pudo guardar el perfil del cliente");
        });

        notifyEscalation({ ticketId, nombreCliente, email, resumen, urgencia, tipoSolicitud, producto, queSeIntentoYa }).catch(
          (error) => {
            logger.warn({ err: error, ticketId }, "No se pudo notificar el canal de escalación en Slack");
          },
        );

        return `Ticket creado en Monday.com con id ${ticketId}.`;
      } catch (error) {
        logger.error({ err: error, email }, "Falló la creación del ticket en Monday.com");
        return `No se pudo crear el ticket en Monday.com: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: "escalar_a_monday",
      description:
        "Crea un ticket de soporte en Monday.com cuando Daniel no puede resolver la consulta del cliente directamente (falta info en la base de conocimiento, bug confirmado, o el cliente pide hablar con una persona).",
      schema: z.object({
        nombreCliente: z.string().describe("Nombre del cliente"),
        email: z.string().describe("Email del cliente"),
        resumen: z.string().describe("Resumen breve del problema o consulta"),
        urgencia: z.enum(["No es urgente", "Urgente"]).describe("Urgencia percibida del caso"),
        tipoSolicitud: z.enum(["Problema", "Solicitud", "Pregunta"]).describe("Tipo de solicitud del cliente"),
        producto: z
          .enum(["Isabella", "Sofi", "Widget-chatbot", "Otro"])
          .describe("Producto de RedTec sobre el que trata la consulta"),
        queSeIntentoYa: z.string().describe("Qué se intentó resolver antes de escalar"),
      }),
    },
  );
}
