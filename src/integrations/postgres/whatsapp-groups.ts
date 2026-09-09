import { getPool } from "./client.js";

// Ruteo group_jid -> empresa para el canal de WhatsApp (ver
// plans/2026-09-06-canal-whatsapp-evolution-api.md). Mismo patrón que tech-agents.ts: caché en
// memoria de TTL corto porque findEmpresaByGroupJid se llama en el camino caliente de cada
// mensaje de WhatsApp, pero sin cachear para siempre para que un INSERT/UPDATE manual se vea
// reflejado sin reiniciar el proceso.
const CACHE_TTL_MS = 60_000;
let cache: { groups: Map<string, string>; expiresAt: number } | undefined;

export function _resetWhatsappGroupsCacheForTests(): void {
  cache = undefined;
}

async function loadGroups(): Promise<Map<string, string>> {
  if (cache && cache.expiresAt > Date.now()) return cache.groups;

  const pool = await getPool();
  const { rows } = await pool.query<{ group_jid: string; empresa: string }>("SELECT group_jid, empresa FROM whatsapp_groups");
  const groups = new Map(rows.map((r) => [r.group_jid, r.empresa]));
  cache = { groups, expiresAt: Date.now() + CACHE_TTL_MS };
  return groups;
}

// undefined = grupo no mapeado a ningún cliente (grupo interno de RedTec, o uno de cliente
// todavía sin clasificar — ver la tabla de referencia en el plan). El caller decide no
// responder en ese caso, no asumir un cliente por default.
export async function findEmpresaByGroupJid(groupJid: string): Promise<string | undefined> {
  const groups = await loadGroups();
  return groups.get(groupJid);
}

// Inverso de findEmpresaByGroupJid — para el ruteo de avisos salientes de cambio de estado de
// ticket ("si el ticket es de Spectrum, avisar en el grupo de Spectrum", pedido de Fernando
// 2026-09-09, ver ticket-status-handler.ts). Si dos group_jid comparten empresa (pasa con RNR,
// ver migrate-whatsapp-groups.ts) devuelve el primero que encuentra — no hay hoy un criterio
// para desempatar entre grupos del mismo cliente.
export async function findGroupJidByEmpresa(empresa: string): Promise<string | undefined> {
  const groups = await loadGroups();
  for (const [groupJid, groupEmpresa] of groups) {
    if (groupEmpresa === empresa) return groupJid;
  }
  return undefined;
}

// Alta/reasignación idempotente de un grupo — usado por migrate-whatsapp-groups.ts (siembra
// inicial, ver la clasificación en plans/2026-09-06-canal-whatsapp-evolution-api.md) y
// disponible para altas puntuales de un cliente nuevo sin tener que escribir el INSERT a mano.
export async function upsertWhatsappGroup(groupJid: string, empresa: string, nombreGrupo?: string): Promise<void> {
  const pool = await getPool();
  await pool.query(
    `INSERT INTO whatsapp_groups (group_jid, empresa, nombre_grupo)
     VALUES ($1, $2, $3)
     ON CONFLICT (group_jid) DO UPDATE SET empresa = $2, nombre_grupo = $3`,
    [groupJid, empresa, nombreGrupo ?? null],
  );
}
