import { describe, expect, it, vi } from "vitest";

const getRealtimeSocket = vi.fn();
vi.mock("./client.js", () => ({ getRealtimeSocket }));

const { requestContainerLogs } = await import("./container-logs.js");

describe("requestContainerLogs", () => {
  it("rechaza un nombre de contenedor no permitido sin tocar el socket", async () => {
    const result = await requestContainerLogs("otro-contenedor" as any, 200);

    expect(result).toEqual({ ok: false, error: "Contenedor no permitido: otro-contenedor" });
    expect(getRealtimeSocket).not.toHaveBeenCalled();
  });

  it("avisa si el realtime no está conectado todavía", async () => {
    getRealtimeSocket.mockReturnValue(undefined);

    const result = await requestContainerLogs("redtec-realstate-api", 200);

    expect(result).toEqual({ ok: false, error: "Realtime de RedTec no conectado" });
  });

  it("pide los logs por el ack de socket.io y devuelve la respuesta del servidor", async () => {
    const emit = vi.fn((_event: string, _payload: unknown, ack: (res: unknown) => void) => {
      ack({ ok: true, logs: "línea 1\nlínea 2" });
    });
    getRealtimeSocket.mockReturnValue({ emit });

    const result = await requestContainerLogs("redtec-realstate-ux", 50);

    expect(emit).toHaveBeenCalledWith("get_container_logs", { container: "redtec-realstate-ux", lines: 50 }, expect.any(Function));
    expect(result).toEqual({ ok: true, logs: "línea 1\nlínea 2" });
  });
});
