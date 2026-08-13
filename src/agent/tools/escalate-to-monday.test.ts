import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupportTicket = vi.fn();
// Estos cuatro se encadenan con .catch() en el código real (best-effort, fire-and-forget),
// así que necesitan devolver siempre una promesa igual que lo haría la implementación real.
const notifyEscalation = vi.fn().mockResolvedValue(undefined);
const saveCustomerProfile = vi.fn().mockResolvedValue(undefined);
const clearHistory = vi.fn().mockResolvedValue(undefined);
const clearTicketDraft = vi.fn().mockResolvedValue(undefined);
const saveTicketDraftFields = vi.fn().mockResolvedValue(undefined);
const saveTicketConversation = vi.fn().mockResolvedValue(undefined);

vi.mock("../../integrations/monday/index.js", () => ({ createSupportTicket }));
vi.mock("../../integrations/slack/notify-escalation.js", () => ({ notifyEscalation }));
vi.mock("../../integrations/mongo/customer-profile.js", () => ({ saveCustomerProfile }));
vi.mock("../../integrations/mongo/conversation-memory.js", () => ({ clearHistory }));
vi.mock("../../integrations/mongo/ticket-draft.js", () => ({ clearTicketDraft, saveTicketDraftFields }));
vi.mock("../../integrations/mongo/ticket-conversations.js", () => ({ saveTicketConversation }));

const { createEscalateToMondayTool } = await import("./escalate-to-monday.js");

const COMPLETE_DRAFT = {
  nombreCliente: "Jorge Calderón",
  email: "jorge.calderon@garooinc.com",
  resumen: "no puede iniciar sesión en Sofi",
  urgencia: "Urgente" as const,
  tipoSolicitud: "Problema" as const,
  producto: "Sofi" as const,
};

describe("escalar_a_monday tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no crea el ticket y guarda el borrador si faltan campos requeridos", async () => {
    const tool = createEscalateToMondayTool("U123", { nombreCliente: "Jorge Calderón" }, "C123");

    const result = await tool.invoke({});

    expect(createSupportTicket).not.toHaveBeenCalled();
    expect(saveTicketDraftFields).toHaveBeenCalledWith("U123", expect.objectContaining({ nombreCliente: "Jorge Calderón" }));
    expect(result).toContain("Todavía falta");
  });

  it("crea el ticket y limpia borrador + historial cuando ya están todos los campos", async () => {
    createSupportTicket.mockResolvedValue("3200000000");
    const tool = createEscalateToMondayTool("U123", COMPLETE_DRAFT, "C123");

    const result = await tool.invoke({});

    expect(createSupportTicket).toHaveBeenCalledWith(expect.objectContaining({ ...COMPLETE_DRAFT, canalOrigen: "slack" }));
    expect(clearTicketDraft).toHaveBeenCalledWith("U123");
    expect(clearHistory).toHaveBeenCalledWith("U123");
    expect(saveCustomerProfile).toHaveBeenCalledWith("U123", { nombreCliente: COMPLETE_DRAFT.nombreCliente, email: COMPLETE_DRAFT.email });
    expect(saveTicketConversation).toHaveBeenCalledWith("3200000000", "U123", "C123");
    expect(notifyEscalation).toHaveBeenCalledWith(expect.objectContaining({ ticketId: "3200000000" }));
    expect(result).toBe("Ticket creado en Monday.com con id 3200000000.");
  });

  it("combina argumentos parciales del modelo con el borrador ya calculado", async () => {
    createSupportTicket.mockResolvedValue("3200000001");
    const tool = createEscalateToMondayTool("U123", { ...COMPLETE_DRAFT, urgencia: undefined }, "C123");

    await tool.invoke({ urgencia: "No es urgente" });

    expect(createSupportTicket).toHaveBeenCalledWith(expect.objectContaining({ urgencia: "No es urgente", producto: "Sofi" }));
  });

  it("no limpia borrador/historial ni notifica si Monday falla", async () => {
    createSupportTicket.mockRejectedValue(new Error("Monday API error: boom"));
    const tool = createEscalateToMondayTool("U123", COMPLETE_DRAFT, "C123");

    const result = await tool.invoke({});

    expect(clearTicketDraft).not.toHaveBeenCalled();
    expect(clearHistory).not.toHaveBeenCalled();
    expect(notifyEscalation).not.toHaveBeenCalled();
    expect(saveTicketConversation).not.toHaveBeenCalled();
    expect(result).toContain("No se pudo crear el ticket");
  });
});
