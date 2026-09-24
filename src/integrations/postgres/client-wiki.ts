import { getPool } from "./client.js";

export type ClientWiki = { contenido: string; fuentes: string[]; updatedAt: Date };

// Filtro determinístico de visibilidad (ver kb/politica-acceso-y-visibilidad.md: "el límite de
// qué ve cada canal se aplica filtrando la query, nunca confiando en que el LLM se
// autocensure"). El contenido crudo de client_wiki mezcla notas de diagnóstico interno (marcadas
// **[INTERNO]**, por convención en encabezados "## ... **[INTERNO]**" o en líneas que arrancan
// con "**[INTERNO]**") con información segura para el propio cliente — esto saca ambas formas
// antes de que el texto llegue al prompt. Limitación conocida, documentada en
// kb/gaps-y-decisiones.md: no separa una marca [INTERNO] a mitad de línea (junto a un dato
// seguro en el mismo bullet) — la convención al escribir client_wiki es poner el dato interno en
// su propia línea/bullet, nunca mezclado con uno seguro.
export function stripInternalContent(markdown: string): string {
  const lines = markdown.split("\n");
  const kept: string[] = [];
  let skippingSectionAtLevel: number | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      if (skippingSectionAtLevel !== null && level <= skippingSectionAtLevel) {
        skippingSectionAtLevel = null;
      }
      if (headingMatch[2].includes("[INTERNO")) {
        skippingSectionAtLevel = level;
        continue;
      }
    }
    if (skippingSectionAtLevel !== null) continue;
    const trimmed = line.trim().replace(/^-\s+/, "");
    if (trimmed.startsWith("**[INTERNO") || trimmed.startsWith("[INTERNO")) continue;
    kept.push(line);
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

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
