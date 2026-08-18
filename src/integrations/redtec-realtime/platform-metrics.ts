import { getPool } from "../postgres/client.js";

// container.stats llega cada 30s (según la guía de RedTec) → ~2880 filas/día. Filas chicas,
// pero sin límite de tiempo no tiene sentido guardarlas para siempre — una semana alcanza de
// sobra para responder "¿cómo estuvo el sistema en la última hora/día?" sin dejar crecer la
// tabla sin límite. El TTL de 7 días real vive en integrations/postgres/retention.ts (Postgres
// no tiene TTL indexes nativos como Mongo, que es de donde migró esto — ver
// plans/2026-08-18-migracion-postgresql-pgvector.md, paso 5).

export type ContainerStat = {
  container: string;
  cpuPercent: number;
  memUsedMb: number;
  memLimitMb: number;
};

export type DiskStat = {
  usedPercent: number;
  usedGb: number;
  totalGb: number;
};

export type ContainerStatsPayload = {
  containers: ContainerStat[];
  disk: DiskStat;
};

type PlatformMetricDoc = ContainerStatsPayload & { receivedAt: Date };

// Se llama una vez por cada push de container.stats del socket de RedTec — best-effort: si
// Postgres falla acá, se loguea (ver client.ts) y se sigue, nunca se corta la conexión del
// socket por esto. Nada de mantener esto solo en memoria: así no se pierde al redeployar.
export async function recordContainerStats(payload: ContainerStatsPayload): Promise<void> {
  const pool = await getPool();
  // JSON.stringify explícito para containers (es un array — sin esto pg lo trataría como un
  // ARRAY literal de Postgres, no como JSON, ver webhook-events.ts para el mismo detalle).
  await pool.query(`INSERT INTO platform_metrics (containers, disk, received_at) VALUES ($1, $2, now())`, [
    JSON.stringify(payload.containers),
    JSON.stringify(payload.disk),
  ]);
}

function formatSnapshot(doc: Pick<PlatformMetricDoc, "containers" | "disk">): string {
  const containersText = doc.containers
    .map((c) => `${c.container}: CPU ${c.cpuPercent}%, memoria ${c.memUsedMb}/${c.memLimitMb}MB`)
    .join(" · ");
  const diskText = `disco ${doc.disk.usedPercent}% (${doc.disk.usedGb}/${doc.disk.totalGb}GB)`;
  return `${containersText} · ${diskText}`;
}

// Funciones puras (sin Mongo) para que sean fáciles de testear — getPlatformMetricsSummary
// solo se encarga de traer los documentos y delegar el formateo acá.
export function formatLatestSnapshot(doc: PlatformMetricDoc): string {
  return `Estado actual (${doc.receivedAt.toISOString()}): ${formatSnapshot(doc)}`;
}

export function formatWindowSummary(docs: PlatformMetricDoc[], sinceMinutes: number): string {
  const latest = docs[docs.length - 1];
  const maxCpuByContainer = new Map<string, number>();
  const maxMemByContainer = new Map<string, number>();
  let maxDiskPercent = 0;

  for (const doc of docs) {
    for (const c of doc.containers) {
      maxCpuByContainer.set(c.container, Math.max(maxCpuByContainer.get(c.container) ?? 0, c.cpuPercent));
      maxMemByContainer.set(c.container, Math.max(maxMemByContainer.get(c.container) ?? 0, c.memUsedMb));
    }
    maxDiskPercent = Math.max(maxDiskPercent, doc.disk.usedPercent);
  }

  const picos = [...maxCpuByContainer.entries()]
    .map(([container, cpu]) => `${container}: pico CPU ${cpu}%, pico memoria ${maxMemByContainer.get(container)}MB`)
    .join(" · ");

  return `Últimos ${sinceMinutes} minutos (${docs.length} muestras) — ${picos} · pico de disco ${maxDiskPercent}%. ${formatLatestSnapshot(latest)}`;
}

type MetricRow = { containers: ContainerStat[]; disk: DiskStat; received_at: Date };

function rowToDoc(row: MetricRow): PlatformMetricDoc {
  // pg ya devuelve las columnas jsonb parseadas como objeto/array JS, no como string —
  // solo hace falta remapear el nombre de columna a receivedAt.
  return { containers: row.containers, disk: row.disk, receivedAt: row.received_at };
}

// Nunca consulta el socket "en vivo" — siempre lee lo ya guardado en Postgres por
// recordContainerStats. Sin sinceMinutes devuelve la última foto conocida; con sinceMinutes
// agrega (picos) sobre esa ventana de tiempo, para responder preguntas sobre el pasado.
export async function getPlatformMetricsSummary(opts: { sinceMinutes?: number } = {}): Promise<string | null> {
  const pool = await getPool();

  if (!opts.sinceMinutes) {
    const result = await pool.query<MetricRow>(`SELECT containers, disk, received_at FROM platform_metrics ORDER BY received_at DESC LIMIT 1`);
    const row = result.rows[0];
    return row ? formatLatestSnapshot(rowToDoc(row)) : null;
  }

  const since = new Date(Date.now() - opts.sinceMinutes * 60_000);
  const result = await pool.query<MetricRow>(
    `SELECT containers, disk, received_at FROM platform_metrics WHERE received_at >= $1 ORDER BY received_at ASC`,
    [since],
  );
  const docs = result.rows.map(rowToDoc);
  return docs.length > 0 ? formatWindowSummary(docs, opts.sinceMinutes) : null;
}
