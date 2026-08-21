import { beforeEach, describe, expect, it, vi } from "vitest";

const extractTechDiagnosis = vi.fn();
const markHandoffAnswered = vi.fn().mockResolvedValue(undefined);
const appendMessage = vi.fn().mockResolvedValue(undefined);
const addTicketUpdate = vi.fn().mockResolvedValue(undefined);
const markTicketReady = vi.fn().mockResolvedValue(undefined);

vi.mock("./extract-tech-diagnosis.js", () => ({ extractTechDiagnosis }));
vi.mock("../integrations/postgres/tech-agent-handoff.js", () => ({ markHandoffAnswered }));
vi.mock("../integrations/postgres/conversation-memory.js", () => ({ appendMessage }));
vi.mock("../integrations/monday/index.js", () => ({ addTicketUpdate, markTicketReady }));

const { deliverTechDiagnosis } = await import("./deliver-tech-diagnosis.js");

const HANDOFF = {
  threadTs: "1699999999.000100",
  sharedChannelId: "C_AGENTES",
  originalSlackUserId: "U_CLIENTE",
  originalChannelId: "C_CLIENTE_DM",
  resumenProblema: "El flujo de n8n falla al recibir un lead",
  mondayItemId: "3200000000",
  status: "pending" as const,
  createdAt: new Date(),
};

function fakeClient() {
  return { chat: { postMessage: vi.fn().mockResolvedValue({ ts: "1700000000.000200" }) } } as any;
}

describe("deliverTechDiagnosis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("le manda al cliente el resumen sin jerga y marca el handoff como respondido cuando hay diagnóstico concreto", async () => {
    extractTechDiagnosis.mockResolvedValue({
      causaRaiz: "El nodo Webhook no valida el JSON entrante",
      componenteAfectado: "Nodo Webhook",
      resuelto: true,
      resumenParaCliente: "encontramos un error en la validación de datos y ya lo corregimos",
    });
    const client = fakeClient();

    await deliverTechDiagnosis(client, HANDOFF, "el nodo Webhook explota con JSON inválido, ya lo arreglé");

    expect(markHandoffAnswered).toHaveBeenCalledWith(
      "1699999999.000100",
      "el nodo Webhook explota con JSON inválido, ya lo arreglé",
      "El nodo Webhook no valida el JSON entrante",
      "Nodo Webhook",
    );
    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C_CLIENTE_DM",
        text: expect.stringContaining("encontramos un error en la validación de datos"),
      }),
    );
    expect(appendMessage).toHaveBeenCalledWith("U_CLIENTE", "ai", expect.stringContaining("revisó tu caso"));
    expect(addTicketUpdate).toHaveBeenCalledWith("3200000000", expect.stringContaining("el nodo Webhook explota"));
    expect(markTicketReady).toHaveBeenCalledWith("3200000000");
  });

  it("avisa que sigue investigando cuando el diagnóstico todavía no es concreto, y no marca el ticket como Listo", async () => {
    extractTechDiagnosis.mockResolvedValue({
      resuelto: false,
      resumenParaCliente: "seguimos revisando el flujo, todavía no encontramos la causa exacta",
    });
    const client = fakeClient();

    await deliverTechDiagnosis(client, HANDOFF, "todavía estoy revisando, no encuentro nada raro aún");

    expect(client.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("está investigando tu caso") }));
    expect(appendMessage).toHaveBeenCalledWith("U_CLIENTE", "ai", expect.stringContaining("investigando"));
    expect(addTicketUpdate).toHaveBeenCalledWith("3200000000", expect.stringContaining("todavía estoy revisando"));
    expect(markTicketReady).not.toHaveBeenCalled();
  });

  it("no pierde la entrega al cliente si falla el guardado en el historial", async () => {
    extractTechDiagnosis.mockResolvedValue({ resuelto: true, resumenParaCliente: "listo" });
    appendMessage.mockRejectedValue(new Error("Mongo timeout"));
    const client = fakeClient();

    await expect(deliverTechDiagnosis(client, HANDOFF, "listo")).resolves.toBeUndefined();
    expect(client.chat.postMessage).toHaveBeenCalled();
  });

  it("no pierde la entrega al cliente si falla la actualización del ticket en Monday", async () => {
    extractTechDiagnosis.mockResolvedValue({ resuelto: true, resumenParaCliente: "listo" });
    addTicketUpdate.mockRejectedValue(new Error("Monday API error: boom"));
    markTicketReady.mockRejectedValue(new Error("Monday API error: boom"));
    const client = fakeClient();

    await expect(deliverTechDiagnosis(client, HANDOFF, "listo")).resolves.toBeUndefined();
    expect(client.chat.postMessage).toHaveBeenCalled();
  });
});
