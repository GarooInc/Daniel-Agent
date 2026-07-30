import { createSupportTicket } from "../integrations/monday/index.js";
import { notifyEscalation } from "../integrations/slack/notify-escalation.js";
import { getCustomerProfile } from "../integrations/mongo/customer-profile.js";
import { logger } from "../config/logger.js";

export type FailedConversation = {
  slackUserId: string;
  nombreClienteFallback: string;
  textoOriginal: string;
  motivo: string;
};

// Crea una escalación real (Monday + aviso en #escalacion) cuando Daniel falla o agota
// sus pasos de tool-calling, para que "ya la voy a escalar a soporte" sea una promesa real
// y no un texto que el cliente lee sin que pase nada del otro lado.
export async function escalateUnresolvedConversation(input: FailedConversation): Promise<string | undefined> {
  const queSeIntentoYa = `Daniel no pudo responder automáticamente: ${input.motivo}`;

  // Si ya conocíamos a este cliente de una escalación anterior, usamos esos datos reales
  // en vez de "no proporcionado" — pero si Mongo es justo la causa de la falla, no dejamos
  // que este lookup también rompa la escalación.
  let nombreCliente = input.nombreClienteFallback;
  let email = "No proporcionado (la conversación falló antes de poder pedirlo)";
  try {
    const profile = await getCustomerProfile(input.slackUserId);
    if (profile?.nombreCliente) nombreCliente = profile.nombreCliente;
    if (profile?.email) email = profile.email;
  } catch (error) {
    logger.warn({ err: error, slackUserId: input.slackUserId }, "No se pudo leer el perfil del cliente para la auto-escalación");
  }

  const ticket = {
    nombreCliente,
    email,
    resumen: input.textoOriginal,
    urgencia: "Urgente" as const,
    tipoSolicitud: "Problema" as const,
    producto: "Otro" as const,
    queSeIntentoYa,
  };

  try {
    const ticketId = await createSupportTicket({ ...ticket, canalOrigen: "slack" });
    logger.info({ ticketId }, "Ticket de auto-escalación creado en Monday.com tras una falla de Daniel");

    notifyEscalation({ ticketId, ...ticket }).catch((error) => {
      logger.warn({ err: error }, "No se pudo notificar el canal de escalación en Slack");
    });

    return ticketId;
  } catch (error) {
    logger.error({ err: error }, "Falló también la auto-escalación a Monday.com tras un error de Daniel");
    return undefined;
  }
}
