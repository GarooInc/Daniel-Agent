import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { env } from "../config/env.js";
import { MODEL } from "./model.js";

const DiagnosisSchema = z.object({
  causaRaiz: z.string().optional().describe("Causa raíz técnica encontrada, en términos internos (puede mencionar nodos de n8n, IDs, etc.)"),
  componenteAfectado: z.string().optional().describe("Qué parte/nodo/integración de la automatización falló"),
  resuelto: z
    .boolean()
    .describe("true si el diagnóstico es concreto y accionable, false si el equipo técnico todavía está investigando o no encontró causa clara"),
  resumenParaCliente: z
    .string()
    .describe("Explicación simple, SIN jerga de n8n (sin nombres de nodos, IDs, JSON), lista para mandarle directo al cliente final."),
});

const diagnosisModel = new ChatOpenAI({
  model: MODEL,
  apiKey: env.openRouterApiKey,
  configuration: { baseURL: "https://openrouter.ai/api/v1" },
}).withStructuredOutput(DiagnosisSchema);

const EXTRACTION_PROMPT =
  "El equipo técnico interno investigó un problema reportado por un cliente en una automatización de n8n y " +
  "escribió este mensaje con su diagnóstico. Extraé la información para poder responderle al cliente sin " +
  "exponerle jerga técnica interna.\n\nMensaje del equipo técnico:\n\n";

// Separado de deliverTechDiagnosis (igual que extractTicketFields de extractTechDiagnosis
// respecto de create-ticket.ts) para poder testear la entrega sin mockear el LLM.
export async function extractTechDiagnosis(mensajeAgenteTecnico: string): Promise<z.infer<typeof DiagnosisSchema>> {
  return diagnosisModel.invoke(EXTRACTION_PROMPT + mensajeAgenteTecnico);
}
