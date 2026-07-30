import { WebClient } from "@slack/web-api";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

const client = new WebClient(env.slackBotToken);

let cachedChannelId: string | undefined;

async function resolveChannelId(): Promise<string | undefined> {
  if (cachedChannelId) return cachedChannelId;

  let cursor: string | undefined;
  do {
    const result = await client.conversations.list({
      types: "public_channel,private_channel",
      limit: 200,
      cursor,
    });

    const match = result.channels?.find((c) => c.name === env.slackEscalationChannel);
    if (match?.id) {
      cachedChannelId = match.id;
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
  const channelId = await resolveChannelId();
  if (!channelId) {
    logger.warn(
      { channel: env.slackEscalationChannel },
      "No se encontró el canal de escalación en Slack (¿Daniel fue invitado al canal?)",
    );
    return;
  }

  await client.chat.postMessage({
    channel: channelId,
    text: `Nuevo ticket de soporte #${notice.ticketId} — ${notice.nombreCliente} (${notice.urgencia})`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `🎫 Ticket #${notice.ticketId} — ${notice.urgencia}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Cliente:*\n${notice.nombreCliente}` },
          { type: "mrkdwn", text: `*Email:*\n${notice.email}` },
          { type: "mrkdwn", text: `*Producto:*\n${notice.producto}` },
          { type: "mrkdwn", text: `*Tipo:*\n${notice.tipoSolicitud}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Resumen:*\n${notice.resumen}` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Qué se intentó:*\n${notice.queSeIntentoYa}` },
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
