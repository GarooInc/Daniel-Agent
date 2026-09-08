import { env } from "../../config/env.js";

// Contrato confirmado por Fernando (2026-09-08): el envío va por REST, no por el socket —
// POST /message/sendText/{instance} con { number, text }, `number` es el JID (@g.us para
// grupos, @s.whatsapp.net o dígitos para DM).
export async function sendGroupMessage(groupJid: string, text: string): Promise<void> {
  if (!env.whatsappEvolutionUrl || !env.whatsappEvolutionApiKey) {
    throw new Error("sendGroupMessage llamado sin WHATSAPP_EVOLUTION_URL/WHATSAPP_EVOLUTION_API_KEY configurados");
  }

  const response = await fetch(`${env.whatsappEvolutionUrl}/message/sendText/${env.whatsappEvolutionInstance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: env.whatsappEvolutionApiKey },
    body: JSON.stringify({ number: groupJid, text }),
  });

  if (!response.ok) {
    throw new Error(`Evolution API respondió ${response.status} al enviar un mensaje a ${groupJid}`);
  }
}
