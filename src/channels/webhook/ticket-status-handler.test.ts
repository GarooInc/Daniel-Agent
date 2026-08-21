import { beforeEach, describe, expect, it, vi } from "vitest";

const findTicketConversation = vi.fn();
const notifyTicketStatusChange = vi.fn().mockResolvedValue(undefined);

vi.mock("../../integrations/postgres/ticket-conversations.js", () => ({ findTicketConversation }));
vi.mock("../../integrations/slack/notify-ticket-status.js", () => ({ notifyTicketStatusChange }));

const { handleTicketStatusChanged } = await import("./ticket-status-handler.js");

describe("handleTicketStatusChanged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("avisa en el canal correlacionado cuando el ticket cambia de estado", async () => {
    findTicketConversation.mockResolvedValue({
      mondayItemId: "3178111557",
      slackUserId: "U123",
      channelId: "C456",
      createdAt: new Date(),
    });

    await handleTicketStatusChanged({
      event: "ticket.status_changed",
      ticket_id: "3178111557",
      title: "No me anda el calendario",
      status: "Done",
    });

    expect(findTicketConversation).toHaveBeenCalledWith("3178111557");
    expect(notifyTicketStatusChange).toHaveBeenCalledWith({
      channelId: "C456",
      ticketId: "3178111557",
      title: "No me anda el calendario",
      status: "Done",
    });
  });

  it("acepta ticket_id numérico y lo normaliza a string", async () => {
    findTicketConversation.mockResolvedValue({ mondayItemId: "1", slackUserId: "U1", channelId: "C1", createdAt: new Date() });

    await handleTicketStatusChanged({ event: "ticket.status_changed", ticket_id: 1, status: "Done" });

    expect(findTicketConversation).toHaveBeenCalledWith("1");
  });

  it("no avisa si no hay conversación correlacionada para ese ticket", async () => {
    findTicketConversation.mockResolvedValue(null);

    await handleTicketStatusChanged({ event: "ticket.status_changed", ticket_id: "999", status: "Done" });

    expect(notifyTicketStatusChange).not.toHaveBeenCalled();
  });

  it("ignora payloads que no son ticket.status_changed", async () => {
    await handleTicketStatusChanged({ event: "otra.cosa", ticket_id: "1", status: "Done" });

    expect(findTicketConversation).not.toHaveBeenCalled();
  });

  it("ignora payloads malformados (sin status, sin ticket_id, no-objeto)", async () => {
    await handleTicketStatusChanged({ event: "ticket.status_changed", ticket_id: "1" });
    await handleTicketStatusChanged({ event: "ticket.status_changed", status: "Done" });
    await handleTicketStatusChanged(null);
    await handleTicketStatusChanged("texto crudo");

    expect(findTicketConversation).not.toHaveBeenCalled();
  });
});
