import { beforeEach, describe, expect, it, vi } from "vitest";

const findStalePendingHandoffs = vi.fn();
const markHandoffTimeout = vi.fn().mockResolvedValue(undefined);
const appendMessage = vi.fn().mockResolvedValue(undefined);
const addTicketUpdate = vi.fn().mockResolvedValue(undefined);

vi.mock("../integrations/postgres/tech-agent-handoff.js", () => ({ findStalePendingHandoffs, markHandoffTimeout }));
vi.mock("../integrations/postgres/conversation-memory.js", () => ({ appendMessage }));
vi.mock("../integrations/monday/index.js", () => ({ addTicketUpdate }));

const { checkTechAgentTimeouts } = await import("./tech-agent-timeout.js");

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

describe("checkTechAgentTimeouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no hace nada si no hay handoffs vencidos", async () => {
    findStalePendingHandoffs.mockResolvedValue([]);
    const client = fakeClient();

    await checkTechAgentTimeouts(client);

    expect(markHandoffTimeout).not.toHaveBeenCalled();
    expect(client.chat.postMessage).not.toHaveBeenCalled();
  });

  it("marca el handoff como timeout, avisa al cliente y al canal compartido, y deja constancia en Monday", async () => {
    findStalePendingHandoffs.mockResolvedValue([HANDOFF]);
    const client = fakeClient();

    await checkTechAgentTimeouts(client);

    expect(markHandoffTimeout).toHaveBeenCalledWith("1699999999.000100");
    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "C_CLIENTE_DM", text: expect.stringContaining("Seguimos investigando") }),
    );
    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "C_AGENTES", thread_ts: "1699999999.000100" }),
    );
    expect(appendMessage).toHaveBeenCalledWith("U_CLIENTE", "ai", expect.stringContaining("Seguimos investigando"));
    expect(addTicketUpdate).toHaveBeenCalledWith("3200000000", expect.stringContaining("no respondió"));
  });

  it("sigue procesando el resto de los handoffs si uno falla", async () => {
    const otroHandoff = { ...HANDOFF, threadTs: "1699999999.000200", mondayItemId: "3200000001" };
    findStalePendingHandoffs.mockResolvedValue([HANDOFF, otroHandoff]);
    markHandoffTimeout.mockRejectedValueOnce(new Error("Postgres timeout")).mockResolvedValueOnce(undefined);
    const client = fakeClient();

    await expect(checkTechAgentTimeouts(client)).resolves.toBeUndefined();

    expect(markHandoffTimeout).toHaveBeenCalledTimes(2);
    expect(client.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({ channel: "C_CLIENTE_DM" }));
  });

  it("no pierde el aviso al cliente si falla el guardado en el historial o la actualización de Monday", async () => {
    findStalePendingHandoffs.mockResolvedValue([HANDOFF]);
    appendMessage.mockRejectedValue(new Error("Postgres timeout"));
    addTicketUpdate.mockRejectedValue(new Error("Monday API error: boom"));
    const client = fakeClient();

    await expect(checkTechAgentTimeouts(client)).resolves.toBeUndefined();
    expect(client.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({ channel: "C_CLIENTE_DM" }));
  });
});
