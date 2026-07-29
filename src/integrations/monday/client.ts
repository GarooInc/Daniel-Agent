import { env } from "../../config/env.js";

const MONDAY_API_URL = "https://api.monday.com/v2";

export async function mondayRequest<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: env.mondayApiToken ?? "",
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = (await response.json()) as { data?: T; errors?: unknown };

  if (body.errors) {
    throw new Error(`Monday API error: ${JSON.stringify(body.errors)}`);
  }

  return body.data as T;
}
