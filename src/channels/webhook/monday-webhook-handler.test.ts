import { beforeEach, describe, expect, it, vi } from "vitest";

const findTicketConversation = vi.fn();
const notifyTicketStatusChange = vi.fn().mockResolvedValue(undefined);
const getItemColumnValue = vi.fn();
const findEmpresaByMondayCliente = vi.fn();
const findGroupJidByEmpresa = vi.fn();
const sendGroupMessage = vi.fn().mockResolvedValue(undefined);

vi.mock("../../integrations/postgres/ticket-conversations.js", () => ({ findTicketConversation }));
vi.mock("../../integrations/slack/notify-ticket-status.js", () => ({ notifyTicketStatusChange }));
vi.mock("../../integrations/monday/get-item.js", () => ({ getItemColumnValue }));
vi.mock("../../integrations/postgres/monday-clientes.js", () => ({ findEmpresaByMondayCliente }));
vi.mock("../../integrations/postgres/whatsapp-groups.js", () => ({ findGroupJidByEmpresa }));
vi.mock("../../integrations/evolution-api/send-message.js", () => ({ sendGroupMessage }));

const { handleMondayNativeEvent, isMondayChallenge } = await import("./monday-webhook-handler.js");

const validEvent = {
  event: {
    boardId: 5092085472,
    pulseId: 3193826245,
    pulseName: "Daniel Soporte Test",
    columnId: "status",
    value: { label: { text: "Testing" } },
  },
};

describe("isMondayChallenge", () => {
  it("reconoce el payload de challenge de Monday", () => {
    expect(isMondayChallenge({ challenge: "abc123" })).toBe(true);
  });

  it("no confunde un evento real con un challenge", () => {
    expect(isMondayChallenge(validEvent)).toBe(false);
    expect(isMondayChallenge(null)).toBe(false);
    expect(isMondayChallenge("texto crudo")).toBe(false);
  });
});

describe("handleMondayNativeEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("avisa en el canal correlacionado cuando el ticket cambia de estado en el board de producción", async () => {
    findTicketConversation.mockResolvedValue({
      mondayItemId: "3193826245",
      slackUserId: "U123",
      channelId: "C456",
      createdAt: new Date(),
    });

    await handleMondayNativeEvent(validEvent);

    expect(findTicketConversation).toHaveBeenCalledWith("3193826245");
    expect(notifyTicketStatusChange).toHaveBeenCalledWith({
      channelId: "C456",
      ticketId: "3193826245",
      title: "Daniel Soporte Test",
      status: "Testing",
    });
    expect(getItemColumnValue).not.toHaveBeenCalled();
  });

  it("ignora eventos de otro board", async () => {
    await handleMondayNativeEvent({ event: { ...validEvent.event, boardId: 111 } });

    expect(findTicketConversation).not.toHaveBeenCalled();
  });

  it("ignora cambios en columnas que no son de estado", async () => {
    await handleMondayNativeEvent({ event: { ...validEvent.event, columnId: "text_mm5sq8cs" } });

    expect(findTicketConversation).not.toHaveBeenCalled();
  });

  it("sin conversación correlacionada pero con Cliente resoluble, avisa por WhatsApp al grupo del cliente", async () => {
    findTicketConversation.mockResolvedValue(null);
    getItemColumnValue.mockResolvedValue("Rock N Rolla");
    findEmpresaByMondayCliente.mockResolvedValue("RNR");
    findGroupJidByEmpresa.mockResolvedValue("120363409107032925@g.us");

    await handleMondayNativeEvent(validEvent);

    expect(getItemColumnValue).toHaveBeenCalledWith("3193826245", "text_mm5s75rw");
    expect(findEmpresaByMondayCliente).toHaveBeenCalledWith("Rock N Rolla");
    expect(findGroupJidByEmpresa).toHaveBeenCalledWith("RNR");
    expect(sendGroupMessage).toHaveBeenCalledWith(
      "120363409107032925@g.us",
      expect.stringContaining("Testing"),
    );
    expect(notifyTicketStatusChange).not.toHaveBeenCalled();
  });

  it("sin conversación correlacionada y sin Cliente en el tablero, no avisa a nadie", async () => {
    findTicketConversation.mockResolvedValue(null);
    getItemColumnValue.mockResolvedValue(null);

    await handleMondayNativeEvent(validEvent);

    expect(findEmpresaByMondayCliente).not.toHaveBeenCalled();
    expect(sendGroupMessage).not.toHaveBeenCalled();
  });

  it("sin conversación correlacionada y con Cliente sin mapear en monday_clientes, no avisa a nadie", async () => {
    findTicketConversation.mockResolvedValue(null);
    getItemColumnValue.mockResolvedValue("Cliente Nuevo Sin Mapear");
    findEmpresaByMondayCliente.mockResolvedValue(undefined);

    await handleMondayNativeEvent(validEvent);

    expect(findGroupJidByEmpresa).not.toHaveBeenCalled();
    expect(sendGroupMessage).not.toHaveBeenCalled();
  });

  it("ignora payloads malformados (sin boardId/pulseId/columnId, no-objeto)", async () => {
    await handleMondayNativeEvent({ event: { boardId: 5092085472, columnId: "status" } });
    await handleMondayNativeEvent({ challenge: "abc123" });
    await handleMondayNativeEvent(null);
    await handleMondayNativeEvent("texto crudo");

    expect(findTicketConversation).not.toHaveBeenCalled();
  });
});
