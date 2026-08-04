import { Queue, Worker } from "bullmq";
import { getRedis } from "../integrations/redis/client.js";
import { logger } from "../config/logger.js";

const QUEUE_NAME = "message-debounce";
const DEBOUNCE_MS = 10000;

interface DebounceJobData {
  source: string;
  userId: string;
  conversationId: string;
}

export type FlushHandler = (
  source: string,
  userId: string,
  conversationId: string,
  texto: string,
) => Promise<void>;

function bufferKey(source: string, userId: string): string {
  return `buffer:${source}:${userId}`;
}

function jobId(source: string, userId: string): string {
  // BullMQ prohíbe ":" en IDs de job personalizados (choca con su propio namespacing interno).
  return `${source}_${userId}`;
}

let queue: Queue<DebounceJobData> | undefined;

function getQueue(): Queue<DebounceJobData> {
  if (!queue) {
    queue = new Queue<DebounceJobData>(QUEUE_NAME, { connection: getRedis() });
  }
  return queue;
}

// Junta mensajes seguidos de un mismo usuario (multi-línea estilo WhatsApp) en una sola
// llamada a askDaniel. Cada mensaje nuevo reinicia la ventana de espera del mismo job
// (mismo jobId = "{source}:{userId}"), así que solo se dispara el flush una vez que el
// usuario deja de escribir por DEBOUNCE_MS.
export async function bufferMessage(
  source: string,
  userId: string,
  conversationId: string,
  texto: string,
): Promise<void> {
  const redis = getRedis();
  const bufferLength = await redis.rpush(bufferKey(source, userId), texto);

  const q = getQueue();
  const id = jobId(source, userId);
  const existing = await q.getJob(id);
  const existingState = existing ? await existing.getState() : undefined;
  if (existing && existingState === "delayed") {
    await existing.remove();
  }
  logger.info({ source, userId, bufferLength, existingState }, "DEBUG bufferMessage");

  try {
    const job = await q.add(
      "flush",
      { source, userId, conversationId },
      { jobId: id, delay: DEBOUNCE_MS, removeOnComplete: true, removeOnFail: true },
    );
    logger.info({ source, userId, jobDelay: job.opts.delay, jobTimestamp: job.timestamp }, "DEBUG job agendado");
  } catch (error) {
    // Puede pasar si el job anterior ya está "activo" (el worker lo está procesando justo
    // ahora) — no es crítico: el mensaje ya quedó bufferizado y se recoge en el próximo flush.
    logger.warn({ err: error, source, userId }, "No se pudo reprogramar el flush de debounce");
  }
}

export function startDebounceWorker(onFlush: FlushHandler): Worker<DebounceJobData> {
  const worker = new Worker<DebounceJobData>(
    QUEUE_NAME,
    async (job) => {
      const { source, userId, conversationId } = job.data;
      const key = bufferKey(source, userId);
      const redis = getRedis();
      const mensajes = await redis.lrange(key, 0, -1);
      await redis.del(key);

      logger.info({ source, userId, count: mensajes.length, mensajes }, "DEBUG flush de debounce");

      if (mensajes.length === 0) return;

      await onFlush(source, userId, conversationId, mensajes.join("\n"));
    },
    { connection: getRedis() },
  );

  worker.on("failed", (job, error) => {
    logger.error({ err: error, jobId: job?.id }, "Falló el flush del debounce de mensajes");
  });

  return worker;
}

export async function closeDebounceQueue(worker: Worker<DebounceJobData>): Promise<void> {
  await worker.close();
  if (queue) {
    await queue.close();
    queue = undefined;
  }
}
