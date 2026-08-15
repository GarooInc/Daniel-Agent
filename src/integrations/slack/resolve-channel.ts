import type { WebClient } from "@slack/web-api";

// Resuelve el nombre de un canal de Slack a su ID (necesario para chat.postMessage), con
// caché por nombre de canal — mismo patrón que ya usaba notify-escalation.ts para #escalacion,
// generalizado para que otros callers (ej. notifyTechAgent en consult-tech-agent.ts) no
// reimplementen la misma paginación de conversations.list.
const cachedChannelIds = new Map<string, string>();

export function _resetChannelCacheForTests(): void {
  cachedChannelIds.clear();
}

export async function resolveChannelId(client: WebClient, channelName: string): Promise<string | undefined> {
  const cached = cachedChannelIds.get(channelName);
  if (cached) return cached;

  let cursor: string | undefined;
  do {
    const result = await client.conversations.list({
      types: "public_channel,private_channel",
      limit: 200,
      cursor,
    });

    const match = result.channels?.find((c) => c.name === channelName);
    if (match?.id) {
      cachedChannelIds.set(channelName, match.id);
      return match.id;
    }

    cursor = result.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return undefined;
}
