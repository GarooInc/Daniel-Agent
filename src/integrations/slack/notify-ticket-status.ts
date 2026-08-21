import { WebClient } from "@slack/web-api";
import { env } from "../../config/env.js";
import { escapeMrkdwn } from "./notify-escalation.js";

const client = new WebClient(env.slackBotToken);

export type TicketStatusNotice = {
  channelId: string;
  ticketId: string;
  title?: string;
  status: string;
};

// Cierra el loop de una sola vía (ver ESTADO-PROYECTO.md pendiente #13): hasta ahora Daniel
// escalaba un ticket y nunca se enteraba de qué pasó después. Postea directo en el canal donde
// se originó la conversación (guardado en ticket_conversations al escalar) — no hace falta
// resolver el canal por nombre porque ya lo tenemos.
export async function notifyTicketStatusChange(notice: TicketStatusNotice): Promise<void> {
  const status = escapeMrkdwn(notice.status);
  const detalle = notice.title ? ` (${escapeMrkdwn(notice.title)})` : "";

  await client.chat.postMessage({
    channel: notice.channelId,
    text: `📋 Tu ticket #${notice.ticketId}${detalle} cambió de estado: *${status}*`,
  });
}
