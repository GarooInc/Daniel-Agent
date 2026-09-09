import { WebClient } from "@slack/web-api";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { getAgentConfig } from "../postgres/agent-config.js";

const client = new WebClient(env.slackBotToken);

// Slack no escapa esto por vos: si un cliente escribe "<https://evil.com|texto>" en su
// mensaje y ese texto llega sin escapar a un campo mrkdwn, Slack lo renderiza como un link
// clickeable real — un vector de phishing contra el equipo de soporte interno.
export function escapeMrkdwn(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

let cachedChannelId: string | undefined;
// El nombre de canal (env.slackEscalationChannel antes, ahora editable desde el panel vía
// daniel_agent_config) queda pegado acá junto al ID resuelto — si el valor configurado cambia,
// el cache de abajo lo detecta y re-resuelve en vez de seguir apuntando al canal viejo para
// siempre.
let cachedChannelName: string | undefined;

export function _resetCachedChannelIdForTests(): void {
  cachedChannelId = undefined;
  cachedChannelName = undefined;
}

async function resolveChannelId(channelName: string): Promise<string | undefined> {
  if (cachedChannelId && cachedChannelName === channelName) return cachedChannelId;

  let cursor: string | undefined;
  do {
    const result = await client.conversations.list({
      types: "public_channel,private_channel",
      limit: 200,
      cursor,
    });

    const match = result.channels?.find((c) => c.name === channelName);
    if (match?.id) {
      cachedChannelId = match.id;
      cachedChannelName = channelName;
      return cachedChannelId;
    }

    cursor = result.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return undefined;
}

export type EscalationNotice = {
  ticketId: string;
  nombreCliente: string;
  email: string;
  resumen: string;
  urgencia: string;
  tipoSolicitud: string;
  producto: string;
  queSeIntentoYa: string;
  canalOrigen?: string;
};

export async function notifyEscalation(notice: EscalationNotice): Promise<void> {
  const config = await getAgentConfig();
  const channelId = await resolveChannelId(config.slackEscalationChannel);
  if (!channelId) {
    logger.warn(
      { channel: config.slackEscalationChannel },
      "No se encontró el canal de escalación en Slack (¿Daniel fue invitado al canal?)",
    );
    return;
  }

  const nombreCliente = escapeMrkdwn(notice.nombreCliente);
  const email = escapeMrkdwn(notice.email);
  const resumen = escapeMrkdwn(notice.resumen);
  const queSeIntentoYa = escapeMrkdwn(notice.queSeIntentoYa);

  await client.chat.postMessage({
    channel: channelId,
    text: `Nuevo ticket de soporte #${notice.ticketId} — ${nombreCliente} (${notice.urgencia})`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `🎫 Ticket #${notice.ticketId} — ${notice.urgencia}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Cliente:*\n${nombreCliente}` },
          { type: "mrkdwn", text: `*Email:*\n${email}` },
          { type: "mrkdwn", text: `*Producto:*\n${notice.producto}` },
          { type: "mrkdwn", text: `*Tipo:*\n${notice.tipoSolicitud}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Resumen:*\n${resumen}` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Qué se intentó:*\n${queSeIntentoYa}` },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `Creado automáticamente por Daniel · canal de origen: ${notice.canalOrigen ?? "slack"}` },
        ],
      },
    ],
  });
}
