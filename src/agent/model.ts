import { ChatOpenAI } from "@langchain/openai";
import { env } from "../config/env.js";

// Modelo fijo en código, no en env var: gpt-5-mini no seguía de forma confiable las
// instrucciones de tool-calling en conversaciones de varios turnos (ver ESTADO-PROYECTO.md,
// 2026-07-30). Si se vuelve a probar otro modelo, cambiar acá.
export const MODEL = "deepseek/deepseek-v4-pro";

// Las tools a bindear se pasan por parámetro (en vez de un array estático fijo) porque el set
// real varía por sesión — ej. consultar_agente_tecnico solo se ofrece si el cliente está
// habilitado para eso (gating por cliente en daniel.ts, ver
// plans/2026-08-12-agente-tecnico-n8n-spectrum.md).
export function buildModel(toolsForBinding: any[]) {
  return new ChatOpenAI({
    model: MODEL,
    apiKey: env.openRouterApiKey,
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
  }).bindTools(toolsForBinding);
}
