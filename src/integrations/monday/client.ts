import { env } from "../../config/env.js";

const MONDAY_API_URL = "https://api.monday.com/v2";

// Distingue "Monday.com rechazó o no pudo procesar la request" de un bug interno cualquiera
// (ver ESTADO-PROYECTO.md, auditoría de buenas prácticas backend) — permite a quien lea los
// logs de producción (pino serializa err.name) filtrar fallas de esta integración específica.
export class MondayApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MondayApiError";
  }
}

export async function mondayRequest<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(MONDAY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: env.mondayApiToken ?? "",
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (error) {
    throw new MondayApiError(`No se pudo conectar con la API de Monday.com: ${error instanceof Error ? error.message : String(error)}`);
  }

  const body = (await response.json()) as { data?: T; errors?: unknown };

  if (body.errors) {
    throw new MondayApiError(`Monday API error: ${JSON.stringify(body.errors)}`);
  }

  return body.data as T;
}
