import type { WebClient } from "@slack/web-api";
import { findPendingHandoffByThreadTs } from "../../integrations/mongo/tech-agent-handoff.js";
import { deliverTechDiagnosis } from "../../agent/deliver-tech-diagnosis.js";
import { logger } from "../../config/logger.js";

export type TechAgentDiagnosisPayload = {
  type: "tech_agent_diagnosis";
  threadTs: string;
  mensaje: string;
};

// El canal Slack compartido con el Agente Técnico quedó como narración visible para humanos
// (decisión 2026-08-13, ver plans/2026-08-12-agente-tecnico-n8n-spectrum.md, "Discusión de
// diseño"): la señal real de "diagnóstico listo" es este webhook, no cualquier mensaje de bot
// en el hilo — evita el problema de "el primer mensaje ya se toma como definitivo".
export function isTechAgentDiagnosisPayload(body: unknown): body is TechAgentDiagnosisPayload {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as Record<string, unknown>).type === "tech_agent_diagnosis" &&
    typeof (body as Record<string, unknown>).threadTs === "string" &&
    typeof (body as Record<string, unknown>).mensaje === "string"
  );
}

export async function handleTechAgentDiagnosis(client: WebClient, payload: TechAgentDiagnosisPayload): Promise<void> {
  const handoff = await findPendingHandoffByThreadTs(payload.threadTs);
  if (!handoff) {
    logger.warn(
      { threadTs: payload.threadTs },
      "Diagnóstico del agente técnico sin handoff pendiente correspondiente (¿ya se resolvió o expiró?)",
    );
    return;
  }
  await deliverTechDiagnosis(client, handoff, payload.mensaje);
}
