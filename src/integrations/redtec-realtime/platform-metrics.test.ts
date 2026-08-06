import { describe, expect, it } from "vitest";
import { formatLatestSnapshot, formatWindowSummary } from "./platform-metrics.js";

const baseDoc = {
  receivedAt: new Date("2026-08-06T12:00:00.000Z"),
  containers: [
    { container: "redtec-realstate-api", cpuPercent: 12, memUsedMb: 340, memLimitMb: 512 },
    { container: "redtec-realstate-ux", cpuPercent: 5, memUsedMb: 200, memLimitMb: 512 },
  ],
  disk: { usedPercent: 40, usedGb: 20, totalGb: 50 },
};

describe("formatLatestSnapshot", () => {
  it("incluye CPU/memoria de cada contenedor y el disco", () => {
    const text = formatLatestSnapshot(baseDoc);
    expect(text).toContain("redtec-realstate-api: CPU 12%, memoria 340/512MB");
    expect(text).toContain("redtec-realstate-ux: CPU 5%, memoria 200/512MB");
    expect(text).toContain("disco 40% (20/50GB)");
  });
});

describe("formatWindowSummary", () => {
  it("calcula el pico de CPU/memoria/disco sobre varias muestras, no solo la última", () => {
    const docs = [
      baseDoc,
      {
        ...baseDoc,
        receivedAt: new Date("2026-08-06T12:00:30.000Z"),
        containers: [
          { container: "redtec-realstate-api", cpuPercent: 90, memUsedMb: 480, memLimitMb: 512 },
          { container: "redtec-realstate-ux", cpuPercent: 5, memUsedMb: 200, memLimitMb: 512 },
        ],
        disk: { usedPercent: 41, usedGb: 20.5, totalGb: 50 },
      },
      {
        ...baseDoc,
        receivedAt: new Date("2026-08-06T12:01:00.000Z"),
        containers: [
          { container: "redtec-realstate-api", cpuPercent: 15, memUsedMb: 350, memLimitMb: 512 },
          { container: "redtec-realstate-ux", cpuPercent: 6, memUsedMb: 210, memLimitMb: 512 },
        ],
        disk: { usedPercent: 40, usedGb: 20, totalGb: 50 },
      },
    ];

    const text = formatWindowSummary(docs, 60);

    expect(text).toContain("Últimos 60 minutos (3 muestras)");
    expect(text).toContain("redtec-realstate-api: pico CPU 90%, pico memoria 480MB");
    expect(text).toContain("redtec-realstate-ux: pico CPU 6%, pico memoria 210MB");
    expect(text).toContain("pico de disco 41%");
    // El "estado más reciente" siempre viene de la última muestra, no de la que tuvo el pico.
    expect(text).toContain("Estado actual (2026-08-06T12:01:00.000Z)");
  });
});
