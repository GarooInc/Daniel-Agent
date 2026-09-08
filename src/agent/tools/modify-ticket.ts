import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { changeTicketPriority, changeTicketStatus, addTicketUpdate, ESTADO_VALUES } from "../../integrations/monday/index.js";
import { URGENCIA_VALUES } from "../../integrations/monday/create-ticket.js";
import { findLatestTicketBySlackUser } from "../../integrations/postgres/ticket-conversations.js";
import { logger } from "../../config/logger.js";

// Punto 30 de ESTADO-PROYECTO.md (pedido de Fernando 2026-09-08): Daniel debe poder modificar un
// ticket ya escalado, no solo crearlo. Factory por el mismo motivo que escalar_a_monday: necesita
// el slackUserId de quien escribe para encontrar su ticket. No recibe el número de ticket como
// argumento a propósito — se asume el más reciente escalado en esta conversación (findLatestTicketBySlackUser),
// mismo criterio de UX que el resto del agente (no pedirle al cliente un dato que ya se puede inferir).
export function createModifyTicketTool(slackUserId: string) {
  return tool(
    async (args) => {
      if (!args.informacionAdicional && !args.urgencia && !args.estado) {
        return "No especificaste ningún cambio. Decime qué información agregar, o si cambió la urgencia o el estado del ticket.";
      }

      const ticketId = await findLatestTicketBySlackUser(slackUserId);
      if (!ticketId) {
        return "No encontré ningún ticket escalado en esta conversación para modificar.";
      }

      const cambios: string[] = [];
      try {
        if (args.informacionAdicional) {
          await addTicketUpdate(ticketId, args.informacionAdicional);
          cambios.push("agregué la información nueva como comentario");
        }
        if (args.urgencia) {
          await changeTicketPriority(ticketId, args.urgencia);
          cambios.push(`cambié la prioridad a "${args.urgencia}"`);
        }
        if (args.estado) {
          await changeTicketStatus(ticketId, args.estado);
          cambios.push(`cambié el estado a "${args.estado}"`);
        }

        logger.info({ ticketId, cambios }, "Ticket modificado en Monday.com a pedido del cliente");
        return `Listo, sobre el ticket #${ticketId}: ${cambios.join("; ")}.`;
      } catch (error) {
        logger.error({ err: error, ticketId }, "Falló la modificación del ticket en Monday.com");
        return `No se pudo modificar el ticket #${ticketId}: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: "modificar_ticket",
      description:
        "Modifica el ticket de soporte más reciente escalado en esta conversación: agrega información nueva que el cliente cuenta después de escalar, y/o cambia su urgencia o estado si el cliente lo pide explícitamente. Solo llamala si el cliente ya tiene un ticket escalado en esta conversación y pide un cambio concreto sobre él — no la uses para crear un ticket nuevo (para eso está escalar_a_monday), ni para consultar el estado de un ticket (no tiene esa capacidad).",
      schema: z.object({
        informacionAdicional: z
          .string()
          .optional()
          .describe("Información nueva que el cliente contó después de escalar, para agregar como comentario al ticket"),
        urgencia: z.enum(URGENCIA_VALUES).optional().describe("Nueva urgencia del ticket, si el cliente indica que cambió"),
        estado: z.enum(ESTADO_VALUES).optional().describe("Nuevo estado del ticket, si el cliente pide reabrirlo o indica que cambió"),
      }),
    },
  );
}
