import { getPool } from "./client.js";

// Log crudo de mensajes de grupos de WhatsApp para la sección "Registro de actividad" del panel
// (ver whatsapp_messages_raw en schema.ts). Insert simple, sin caché ni lectura — la lectura
// vive del lado del panel.
export interface WhatsappMessageInput {
  groupJid: string;
  participant?: string;
  participantAlt?: string;
  texto: string;
  mentioned: boolean;
}

export async function insertWhatsappMessage(input: WhatsappMessageInput): Promise<void> {
  const pool = await getPool();
  await pool.query(
    `INSERT INTO whatsapp_messages_raw (group_jid, participant, participant_alt, texto, mentioned)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.groupJid, input.participant ?? null, input.participantAlt ?? null, input.texto, input.mentioned],
  );
}
