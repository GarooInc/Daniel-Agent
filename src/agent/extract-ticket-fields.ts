import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { MODEL } from "./model.js";
import { URGENCIA_VALUES, TIPO_SOLICITUD_VALUES, PRODUCTO_VALUES } from "../integrations/monday/create-ticket.js";
import type { TicketDraftFields } from "../integrations/mongo/ticket-draft.js";
import type { StoredMessage } from "../integrations/mongo/conversation-memory.js";

const ExtractionSchema = z.object({
  nombreCliente: z.string().optional().describe("Nombre completo del cliente, solo si lo dijo explícitamente en la conversación"),
  email: z.string().optional().describe("Email del cliente, solo si lo dijo explícitamente en la conversación"),
  resumen: z.string().optional().describe("Resumen breve y claro del problema o consulta, si se puede armar con lo que dijo"),
  urgencia: z
    .enum(URGENCIA_VALUES)
    .optional()
    .describe("Urgencia del caso, solo si se puede inferir con confianza de lo que dijo el cliente"),
  tipoSolicitud: z.enum(TIPO_SOLICITUD_VALUES).optional().describe("Tipo de solicitud, solo si es claro"),
  producto: z.enum(PRODUCTO_VALUES).optional().describe("Producto de RedTec mencionado"),
  queSeIntentoYa: z.string().optional().describe("Qué intentó el cliente para resolverlo antes, si lo mencionó"),
});

const extractionModel = new ChatOpenAI({
  model: MODEL,
  apiKey: env.openRouterApiKey,
  configuration: { baseURL: "https://openrouter.ai/api/v1" },
}).withStructuredOutput(ExtractionSchema);

const EXTRACTION_PROMPT =
  "Analizá esta conversación de soporte entre un cliente y Daniel (agente de RedTec) y extraé SOLO los datos " +
  "que el cliente haya dado de forma explícita y clara en cualquier punto de la conversación, para poder armar " +
  "un ticket de soporte. No inventes ni infieras de más — si un dato no aparece con claridad, OMITÍ el campo " +
  "por completo (no lo incluyas en la respuesta, y nunca uses un string vacío \"\" como valor).\n\n" +
  "Conversación:\n\n";

// Corre en cada mensaje, independiente de si el modelo principal decide llamar a
// escalar_a_monday o no — es la red de seguridad real contra que el LLM principal "se
// olvide" de datos ya dados. Ver ESTADO-PROYECTO.md (2026-07-30) para el porqué: en pruebas
// en vivo, ni gpt-5-mini ni deepseek-v4-pro llamaban la tool con la disciplina esperada.
export async function extractTicketFields(history: StoredMessage[], currentMessage: string): Promise<TicketDraftFields> {
  const transcript = [...history.map((m) => `${m.role === "human" ? "Cliente" : "Daniel"}: ${m.content}`), `Cliente: ${currentMessage}`].join(
    "\n\n",
  );

  try {
    return await extractionModel.invoke(EXTRACTION_PROMPT + transcript);
  } catch (error) {
    logger.warn({ err: error }, "Falló la extracción automática de datos del ticket");
    return {};
  }
}
