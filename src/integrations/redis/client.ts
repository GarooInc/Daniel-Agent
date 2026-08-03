import { Redis } from "ioredis";
import { env } from "../../config/env.js";

let client: Redis | undefined;

// BullMQ exige maxRetriesPerRequest: null en la conexión que le pasamos.
export function getRedisConnectionOptions() {
  return { maxRetriesPerRequest: null as null };
}

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(env.redisUrl ?? "", getRedisConnectionOptions());
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = undefined;
  }
}
