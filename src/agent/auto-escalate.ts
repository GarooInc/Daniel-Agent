import { createSupportTicket } from "../integrations/monday/index.js";
import { notifyEscalation } from "../integrations/slack/notify-escalation.js";
import { getCustomerProfile } from "../integrations/postgres/customer-profile.js";
import { clearHistory } from "../integrations/postgres/conversation-memory.js";
import { clearTicketDraft, getTicketDraft } from "../integrations/postgres/ticket-draft.js";
import { saveTicketConversation } from "../integrations/postgres/ticket-conversations.js";
import { mergeTicketFields } from "./tools/ticket-fields.js";
import { logger } from "../config/logger.js";

export type FailedConversation = {
  slackUserId: string;
  channelId: string;
  nombreClienteFallback: string;
  textoOriginal: string;
  motivo: string;
};

// Crea una escalación real (Monday + aviso en #escalacion) cuando Daniel falla o agota
// sus pasos de tool-calling, para que "ya la voy a escalar a soporte" sea una promesa real
// y no un texto que el cliente lee sin que pase nada del otro lado.
export async function escalateUnresolvedConversation(input: FailedConversation): Promise<string | undefined> {
  const queSeIntentoYa = `Daniel no pudo responder automáticamente: ${input.motivo}`;

  // Intentamos enriquecer la escalación con los datos reales que se acumularon durante la
  // conversación (ticket_draft + perfil), antes de caer a los valores genéricos de fallback.
  // Si Mongo es la causa del fallo, ninguno de estos lookups debe romper la escalación.
  let profileNombre = input.nombreClienteFallback;
  let profileEmail = "No proporcionado (la conversación falló antes de poder pedirlo)";
  try {
    const profile = await getCustomerProfile(input.slackUserId);
    if (profile?.nombreCliente) profileNombre = profile.nombreCliente;
    if (profile?.email) profileEmail = profile.email;
  } catch (error) {
    logger.warn({ err: error, slackUserId: input.slackUserId }, "No se pudo leer el perfil del cliente para la auto-escalación");
  }

  // El ticket_draft tiene los campos que extractTicketFields fue acumulando en cada mensaje
  // (producto, resumen, urgencia, etc.) — mucho más útil que los valores fijos genéricos.
  let draft = {};
  try {
    draft = await getTicketDraft(input.slackUserId);
  } catch (error) {
    logger.warn({ err: error, slackUserId: input.slackUserId }, "No se pudo leer el borrador del ticket para la auto-escalación");
  }

  // Prioridad: draft (datos reales de la conversación) > perfil guardado > fallbacks genéricos.
  const merged = mergeTicketFields(draft, { nombreCliente: profileNombre, email: profileEmail });

  const ticket = {
    nombreCliente: merged.nombreCliente ?? profileNombre,
    email: merged.email ?? profileEmail,
    resumen: merged.resumen ?? input.textoOriginal,
    urgencia: merged.urgencia ?? ("Urgente" as const),
    tipoSolicitud: merged.tipoSolicitud ?? ("Problema" as const),
    producto: merged.producto ?? ("Otro" as const),
    queSeIntentoYa,
  };

  try {
    const ticketId = await createSupportTicket({ ...ticket, canalOrigen: "slack" });
    logger.info({ ticketId }, "Ticket de auto-escalación creado en Monday.com tras una falla de Daniel");

    notifyEscalation({ ticketId, ...ticket }).catch((error) => {
      logger.warn({ err: error }, "No se pudo notificar el canal de escalación en Slack");
    });
    saveTicketConversation(ticketId, input.slackUserId, input.channelId).catch((error) => {
      logger.warn({ err: error, ticketId, slackUserId: input.slackUserId }, "No se pudo guardar la correlación ticket↔conversación");
    });
    clearTicketDraft(input.slackUserId).catch((error) => {
      logger.warn({ err: error, slackUserId: input.slackUserId }, "No se pudo limpiar el borrador del ticket tras la auto-escalación");
    });
    clearHistory(input.slackUserId).catch((error) => {
      logger.warn({ err: error, slackUserId: input.slackUserId }, "No se pudo limpiar el historial de chat tras la auto-escalación");
    });

    return ticketId;
  } catch (error) {
    logger.error({ err: error }, "Falló también la auto-escalación a Monday.com tras un error de Daniel");
    return undefined;
  }
}
