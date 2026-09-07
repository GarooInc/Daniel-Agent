import { getPool } from "./client.js";

export type ClientWiki = { contenido: string; fuentes: string[]; updatedAt: Date };

// Capa "wiki" del patrón LLM Wiki de Karpathy adaptado a este proyecto — ver
// plans/2026-09-07-client-wiki.md. Sin caché (a diferencia de tech-agents.ts): esto no se lee
// en el camino caliente de cada mensaje, solo cuando Daniel necesita consultar el conocimiento
// de un cliente puntual — un SELECT extra ahí no es un costo real.
export async function getClientWiki(empresa: string): Promise<ClientWiki | null> {
  const pool = await getPool();
  const result = await pool.query<{ contenido: string; fuentes: string[]; updated_at: Date }>(
    "SELECT contenido, fuentes, updated_at FROM client_wiki WHERE empresa = $1",
    [empresa],
  );
  const row = result.rows[0];
  return row ? { contenido: row.contenido, fuentes: row.fuentes, updatedAt: row.updated_at } : null;
}

export async function saveClientWiki(empresa: string, contenido: string, fuentes: string[]): Promise<void> {
  const pool = await getPool();
  await pool.query(
    `INSERT INTO client_wiki (empresa, contenido, fuentes, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (empresa) DO UPDATE SET contenido = $2, fuentes = $3, updated_at = now()`,
    [empresa, contenido, fuentes],
  );
}
