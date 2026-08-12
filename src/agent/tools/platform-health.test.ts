import { describe, expect, it, vi } from "vitest";

const getPlatformMetricsSummary = vi.fn();
vi.mock("../../integrations/redtec-realtime/platform-metrics.js", () => ({ getPlatformMetricsSummary }));

const { platformHealthTool } = await import("./platform-health.js");

describe("estado_de_la_plataforma tool", () => {
  it("devuelve el resumen cuando hay datos guardados", async () => {
    getPlatformMetricsSummary.mockResolvedValue("Estado actual: todo OK");

    const result = await platformHealthTool.invoke({});

    expect(result).toBe("Estado actual: todo OK");
    expect(getPlatformMetricsSummary).toHaveBeenCalledWith({ sinceMinutes: undefined });
  });

  it("pasa sinceMinutes cuando el modelo pregunta por el pasado", async () => {
    getPlatformMetricsSummary.mockResolvedValue("Últimos 60 minutos: todo OK");

    await platformHealthTool.invoke({ sinceMinutes: 60 });

    expect(getPlatformMetricsSummary).toHaveBeenCalledWith({ sinceMinutes: 60 });
  });

  it("avisa en vez de fallar cuando todavía no hay ningún dato guardado", async () => {
    getPlatformMetricsSummary.mockResolvedValue(null);

    const result = await platformHealthTool.invoke({});

    expect(result).toBe("Todavía no tengo datos de salud recientes de la plataforma.");
  });
});
