import { ChatOpenAI } from "@langchain/openai";
import { env } from "../config/env.js";
import { tools } from "./tools/index.js";

// Modelo fijo en código, no en env var: gpt-5-mini no seguía de forma confiable las
// instrucciones de tool-calling en conversaciones de varios turnos (ver ESTADO-PROYECTO.md,
// 2026-07-30). Si se vuelve a probar otro modelo, cambiar acá.
const MODEL = "deepseek/deepseek-v4-pro";

export function buildModel() {
  return new ChatOpenAI({
    model: MODEL,
    apiKey: env.openRouterApiKey,
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
  }).bindTools(tools);
}
