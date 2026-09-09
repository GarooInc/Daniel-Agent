import { getPool } from "./client.js";

// Mapeo columna "Cliente" de Monday -> empresa, ver schema.ts para el porqué. Mismo patrón de
// caché que whatsapp-groups.ts/tech-agents.ts: TTL corto porque se consulta en el camino de un
// evento de webhook, pero no cacheado para siempre para que un INSERT manual se vea reflejado
// sin reiniciar el proceso.
const CACHE_TTL_MS = 60_000;
let cache: { mapping: Map<string, string>; expiresAt: number } | undefined;

export function _resetMondayClientesCacheForTests(): void {
  cache = undefined;
}

async function loadMapping(): Promise<Map<string, string>> {
  if (cache && cache.expiresAt > Date.now()) return cache.mapping;

  const pool = await getPool();
  const { rows } = await pool.query<{ monday_cliente: string; empresa: string }>("SELECT monday_cliente, empresa FROM monday_clientes");
  const mapping = new Map(rows.map((r) => [r.monday_cliente, r.empresa]));
  cache = { mapping, expiresAt: Date.now() + CACHE_TTL_MS };
  return mapping;
}

// undefined = valor de la columna "Cliente" sin mapear todavía (cliente nuevo, o typo del
// agente que la llenó) — el caller decide no notificar por WhatsApp en ese caso, no asumir.
export async function findEmpresaByMondayCliente(mondayCliente: string): Promise<string | undefined> {
  const mapping = await loadMapping();
  return mapping.get(mondayCliente);
}

// Alta/reasignación idempotente — usado por migrate-monday-clientes.ts (siembra inicial) y
// disponible para altas puntuales sin escribir el INSERT a mano.
export async function upsertMondayCliente(mondayCliente: string, empresa: string): Promise<void> {
  const pool = await getPool();
  await pool.query(
    `INSERT INTO monday_clientes (monday_cliente, empresa) VALUES ($1, $2)
     ON CONFLICT (monday_cliente) DO UPDATE SET empresa = $2`,
    [mondayCliente, empresa],
  );
}
