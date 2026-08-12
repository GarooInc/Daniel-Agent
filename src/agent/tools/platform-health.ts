import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getPlatformMetricsSummary } from "../../integrations/redtec-realtime/platform-metrics.js";

export const platformHealthTool = tool(
  async ({ sinceMinutes }) => {
    const summary = await getPlatformMetricsSummary({ sinceMinutes });
    return summary ?? "Todavía no tengo datos de salud recientes de la plataforma.";
  },
  {
    name: "estado_de_la_plataforma",
    description:
      "Consulta el estado de salud (CPU, memoria, disco) de la plataforma de RedTec, para responder si el sistema está o estuvo funcionando bien. Los datos vienen de métricas ya guardadas (se actualizan cada 30s), no se piden en vivo al momento de la consulta.",
    schema: z.object({
      sinceMinutes: z
        .number()
        .optional()
        .describe(
          "Si el cliente pregunta por un momento pasado (ej. 'hace una hora', 'hoy a la mañana'), cuántos minutos atrás cubrir. Omitilo si pregunta por el estado actual.",
        ),
    }),
  },
);
