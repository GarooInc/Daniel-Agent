import { getPool } from "./client.js";
import { SYSTEM_PROMPT as DEFAULT_SYSTEM_PROMPT } from "../../agent/prompt.js";

// Config de Daniel editable en vivo desde Support-Agent-Panel — ver schema.ts para la tabla.
// `connectedTools: null` significa "todas habilitadas" (default antes de que el panel guarde
// nada), no una lista vacía deliberada.
export interface AgentConfig {
  systemPrompt: string;
  businessRules: string[];
  connectedTools: string[] | null;
  updatedAt: Date;
  updatedBy: string | null;
}

// Mismo patrón que tech-agents.ts: TTL corto en vez de sin caché, porque esto se lee en el
// camino caliente de cada mensaje (agent/daniel.ts) — un SELECT por mensaje sería un costo
// innecesario para una tabla que cambia poco, pero el TTL sigue dejando que un cambio guardado
// desde el panel se vea reflejado sin reiniciar el proceso.
const CACHE_TTL_MS = 60_000;
let cache: { config: AgentConfig; expiresAt: number } | undefined;

export function _resetAgentConfigCacheForTests(): void {
  cache = undefined;
}

async function loadAgentConfig(): Promise<AgentConfig> {
  if (cache && cache.expiresAt > Date.now()) return cache.config;

  const pool = await getPool();
  const { rows } = await pool.query<{
    system_prompt: string | null;
    business_rules: string[] | null;
    connected_tools: string[] | null;
    updated_at: Date;
    updated_by: string | null;
  }>("SELECT system_prompt, business_rules, connected_tools, updated_at, updated_by FROM daniel_agent_config WHERE id = 1");

  const row = rows[0];
  const config: AgentConfig = {
    // Fila ausente o system_prompt en blanco => el prompt de código es el default real, no un
    // string vacío corriendo en producción.
    systemPrompt: row?.system_prompt || DEFAULT_SYSTEM_PROMPT,
    businessRules: row?.business_rules ?? [],
    connectedTools: row?.connected_tools ?? null,
    updatedAt: row?.updated_at ?? new Date(0),
    updatedBy: row?.updated_by ?? null,
  };
  cache = { config, expiresAt: Date.now() + CACHE_TTL_MS };
  return config;
}

export async function getAgentConfig(): Promise<AgentConfig> {
  return loadAgentConfig();
}

// Compone el system prompt final que recibe el modelo: el texto editable desde el panel más
// las reglas de negocio agregadas como lista al final — mismo mecanismo que buildKnownDataNote
// en agent/daniel.ts para los datos del ticket (texto plano concatenado, no plantillas).
export function buildSystemPrompt(config: AgentConfig): string {
  if (config.businessRules.length === 0) return config.systemPrompt;
  const rules = config.businessRules.map((r) => `- ${r}`).join("\n");
  return `${config.systemPrompt}\n\nReglas de negocio adicionales (configuradas desde el panel):\n${rules}`;
}

// Usado por el script de siembra inicial (migrate-agent-config.ts) para dejar la fila 1 con el
// prompt/tools que hoy corren hardcodeados, antes de que el panel empiece a escribir encima.
export async function seedAgentConfigIfMissing(): Promise<void> {
  const pool = await getPool();
  await pool.query(
    `INSERT INTO daniel_agent_config (id, system_prompt, business_rules, connected_tools, updated_by)
     VALUES (1, $1, '[]', NULL, 'seed')
     ON CONFLICT (id) DO NOTHING`,
    [DEFAULT_SYSTEM_PROMPT],
  );
}
