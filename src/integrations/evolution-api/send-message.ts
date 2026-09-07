import { env } from "../../config/env.js";

// Contrato NO confirmado explícitamente por Fernando (punto abierto #3 del plan) — hipótesis
// documentada en ESTADO-PROYECTO.md punto 24, patrón estándar de Evolution API:
// POST /message/sendText/{instance} con { number, text }. Probar con un curl de prueba contra
// un grupo de prueba antes de confiar en esto para responder a un cliente real.
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
