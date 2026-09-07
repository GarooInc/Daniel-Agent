import { ChatOpenAI } from "@langchain/openai";
import { env } from "../config/env.js";
import { MODEL } from "./model.js";
import { getClientWiki, saveClientWiki } from "../integrations/postgres/client-wiki.js";
import type { TechAgentHandoffDoc } from "../integrations/postgres/tech-agent-handoff.js";
import { logger } from "../config/logger.js";

const compileModel = new ChatOpenAI({
  model: MODEL,
  apiKey: env.openRouterApiKey,
  configuration: { baseURL: "https://openrouter.ai/api/v1" },
});

// Scaffold estable de secciones para la primera página de un cliente — le da al LLM un lugar
// fijo donde fusionar, en vez de reinventar la estructura en cada compilación (ver
// plans/2026-09-07-client-wiki.md).
const SECCIONES_INICIALES = "## Resumen del sistema\n\n## Componentes conocidos\n\n## Incidentes y causas raíz conocidas\n";

export type DiagnosisForWiki = { causaRaiz?: string; componenteAfectado?: string };

// Fusiona (no apila) un diagnóstico nuevo del Agente Técnico en la página de conocimiento del
// cliente — patrón "LLM Wiki" de Karpathy adaptado a Postgres, ver
// plans/2026-09-07-client-wiki.md. `tech_agent_handoffs` es la capa "raw" (inmutable, ya
// existía); esto compila esa capa en la página "wiki" que Daniel consulta directo, sin
// embeddings ni búsqueda, la próxima vez que necesite saber algo del sistema de este cliente.
// Best-effort — el caller (deliver-tech-diagnosis.ts) ya le respondió al cliente, esto nunca
// debe bloquear ni romper esa entrega.
export async function compileClientWikiFromDiagnosis(empresa: string, handoff: TechAgentHandoffDoc, diagnosis: DiagnosisForWiki): Promise<void> {
  // El Técnico sigue investigando (sin causa raíz ni componente concreto) — nada que fusionar
  // todavía, mejor no tocar la página que escribir algo vacío/especulativo.
  if (!diagnosis.causaRaiz && !diagnosis.componenteAfectado) return;

  const existing = await getClientWiki(empresa);
  const paginaActual = existing?.contenido ?? SECCIONES_INICIALES;

  const prompt = `Mantenés la página de conocimiento técnico del cliente "${empresa}" — cómo funciona su sistema, qué componentes tiene, qué fallas ya se conocen. Fusioná el diagnóstico nuevo con la página actual: no repitas lo que ya dice, y si contradice algo viejo marcalo como desactualizado en vez de borrarlo. Usá SOLO datos que estén en el diagnóstico nuevo o ya en la página — nunca inventes nada que no esté ahí. Mantené las mismas secciones (##).

Página actual:
${paginaActual}

Problema reportado por el cliente: "${handoff.resumenProblema}"
Causa raíz encontrada: ${diagnosis.causaRaiz ?? "no determinada"}
Componente afectado: ${diagnosis.componenteAfectado ?? "no determinado"}

Devolvé la página COMPLETA actualizada, en markdown, sin agregar comentarios fuera de la página.`;

  const response = await compileModel.invoke(prompt);
  const contenido = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

  const fuentesPrevias = existing?.fuentes ?? [];
  const fuentes = fuentesPrevias.includes(handoff.threadTs) ? fuentesPrevias : [...fuentesPrevias, handoff.threadTs];

  await saveClientWiki(empresa, contenido, fuentes);
  logger.info({ empresa, threadTs: handoff.threadTs }, "Página de conocimiento del cliente actualizada");
}
