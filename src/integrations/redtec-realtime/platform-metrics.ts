import { getDb } from "../mongo/client.js";

const COLLECTION = "platform_metrics";
// container.stats llega cada 30s (según la guía de RedTec) → ~2880 docs/día. Documentos
// chicos, pero sin límite de tiempo no tiene sentido guardarlos para siempre — una semana
// alcanza de sobra para responder "¿cómo estuvo el sistema en la última hora/día?" sin dejar
// crecer la colección sin límite.
const RETENTION_DAYS = 7;

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

let indexEnsured = false;

async function ensureRetentionIndex(): Promise<void> {
  if (indexEnsured) return;
  const db = await getDb();
  await db.collection(COLLECTION).createIndex({ receivedAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 });
  indexEnsured = true;
}

// Se llama una vez por cada push de container.stats del socket de RedTec — best-effort: si
// Mongo falla acá, se loguea (ver client.ts) y se sigue, nunca se corta la conexión del
// socket por esto. Nada de mantener esto solo en memoria: así no se pierde al redeployar.
export async function recordContainerStats(payload: ContainerStatsPayload): Promise<void> {
  const db = await getDb();
  await ensureRetentionIndex();
  await db.collection<PlatformMetricDoc>(COLLECTION).insertOne({ ...payload, receivedAt: new Date() });
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

// Nunca consulta el socket "en vivo" — siempre lee lo ya guardado en Mongo por
// recordContainerStats. Sin sinceMinutes devuelve la última foto conocida; con sinceMinutes
// agrega (picos) sobre esa ventana de tiempo, para responder preguntas sobre el pasado.
export async function getPlatformMetricsSummary(opts: { sinceMinutes?: number } = {}): Promise<string | null> {
  const db = await getDb();
  const collection = db.collection<PlatformMetricDoc>(COLLECTION);

  if (!opts.sinceMinutes) {
    const [latest] = await collection.find().sort({ receivedAt: -1 }).limit(1).toArray();
    return latest ? formatLatestSnapshot(latest) : null;
  }

  const since = new Date(Date.now() - opts.sinceMinutes * 60_000);
  const docs = await collection.find({ receivedAt: { $gte: since } }).sort({ receivedAt: 1 }).toArray();
  return docs.length > 0 ? formatWindowSummary(docs, opts.sinceMinutes) : null;
}
