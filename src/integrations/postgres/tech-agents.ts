import { getPool } from "./client.js";
import type { TechAgentConfig } from "../../config/tech-agents.js";

// Reemplaza la tabla TECH_AGENTS hardcodeada de config/tech-agents.ts (2026-08-21, ver
// ESTADO-PROYECTO.md pendiente #3): sumar un cliente nuevo ahora es un INSERT en `tech_agents`,
// no un deploy de código. Caché en memoria con TTL corto (no sin caché) porque
// findTechAgentConfig se llama en el camino caliente de cada mensaje (agent/daniel.ts) — un
// SELECT por mensaje sería un costo innecesario para una tabla que casi no cambia, pero un TTL
// corto sigue dejando que un INSERT manual se vea reflejado sin reiniciar el proceso.
const CACHE_TTL_MS = 60_000;
let cache: { agents: TechAgentConfig[]; expiresAt: number } | undefined;

export function _resetTechAgentsCacheForTests(): void {
  cache = undefined;
}

async function loadTechAgents(): Promise<TechAgentConfig[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.agents;

  const pool = await getPool();
  const { rows } = await pool.query<{ empresa: string; slack_channel: string; slack_bot_user_id: string }>(
    "SELECT empresa, slack_channel, slack_bot_user_id FROM tech_agents ORDER BY empresa",
  );
  const agents = rows.map((r) => ({
    empresa: r.empresa,
    slackChannel: r.slack_channel,
    slackBotUserId: r.slack_bot_user_id,
  }));
  cache = { agents, expiresAt: Date.now() + CACHE_TTL_MS };
  return agents;
}

export async function listTechAgents(): Promise<TechAgentConfig[]> {
  return loadTechAgents();
}

export async function findTechAgentConfig(empresa: string | undefined): Promise<TechAgentConfig | undefined> {
  if (!empresa) return undefined;
  const agents = await loadTechAgents();
  return agents.find((c) => c.empresa.toLowerCase() === empresa.toLowerCase());
}

// Alta idempotente de un cliente — usado por migrate-tech-agents.ts (seed inicial) y disponible
// para altas puntuales por script/consola sin tener que escribir el INSERT a mano cada vez.
export async function upsertTechAgent(config: TechAgentConfig): Promise<void> {
  const pool = await getPool();
  await pool.query(
    `INSERT INTO tech_agents (empresa, slack_channel, slack_bot_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (empresa) DO UPDATE SET slack_channel = $2, slack_bot_user_id = $3`,
    [config.empresa, config.slackChannel, config.slackBotUserId],
  );
}
