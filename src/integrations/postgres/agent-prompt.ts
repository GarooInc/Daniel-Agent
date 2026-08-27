import { getPool } from "./client.js";
import { logger } from "../../config/logger.js";

// Lado de LECTURA del SYSTEM_PROMPT editable desde el panel admin del Portal RedTec (ver
// agent_prompts en schema.ts). El panel escribe (INSERT de una versión nueva + activarla) desde
// su propio rol de Postgres — este archivo solo lee la versión activa. Mismo patrón de cache que
// integrations/postgres/tech-agents.ts (TTL 60s): findActivePrompt() se llama en el camino
// caliente de cada mensaje (agent/daniel.ts), así que un SELECT por mensaje sería costo
// innecesario para una tabla que casi no cambia, pero el TTL corto sigue dejando que una
// activación nueva desde el panel se vea reflejada sin reiniciar el proceso.
const CACHE_TTL_MS = 60_000;
let cache: { promptText: string | undefined; expiresAt: number } | undefined;

export function _resetAgentPromptCacheForTests(): void {
  cache = undefined;
}

// undefined si no hay ninguna fila activa (todavía no se guardó nada desde el panel) o si la
// consulta falla — el caller (daniel.ts) es quien decide el fallback al SYSTEM_PROMPT
// hardcodeado, nunca deja a Daniel sin prompt de sistema. Falla "silenciosa" a propósito: un
// problema de conexión acá no puede tumbar la conversación con el cliente.
export async function findActivePrompt(): Promise<string | undefined> {
  if (cache && cache.expiresAt > Date.now()) return cache.promptText;

  try {
    const pool = await getPool();
    const { rows } = await pool.query<{ prompt_text: string }>(
      "SELECT prompt_text FROM agent_prompts WHERE activo LIMIT 1",
    );
    const promptText = rows[0]?.prompt_text;
    cache = { promptText, expiresAt: Date.now() + CACHE_TTL_MS };
    return promptText;
  } catch (error) {
    logger.warn({ err: error }, "No se pudo leer el prompt activo de Postgres — se usa el SYSTEM_PROMPT hardcodeado");
    // No cachear el fallo: si fue un problema transitorio, el próximo mensaje reintenta en vez
    // de quedar pegado 60s devolviendo undefined.
    return undefined;
  }
}
