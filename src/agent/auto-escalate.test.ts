import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupportTicket = vi.fn();
const notifyEscalation = vi.fn().mockResolvedValue(undefined);
const clearTicketDraft = vi.fn().mockResolvedValue(undefined);
const clearHistory = vi.fn().mockResolvedValue(undefined);
const getCustomerProfile = vi.fn();
const getTicketDraft = vi.fn();
const saveTicketConversation = vi.fn().mockResolvedValue(undefined);

vi.mock("../integrations/monday/index.js", () => ({ createSupportTicket }));
vi.mock("../integrations/slack/notify-escalation.js", () => ({ notifyEscalation }));
vi.mock("../integrations/postgres/customer-profile.js", () => ({ getCustomerProfile }));
vi.mock("../integrations/postgres/conversation-memory.js", () => ({ clearHistory }));
vi.mock("../integrations/postgres/ticket-draft.js", () => ({ clearTicketDraft, getTicketDraft }));
vi.mock("../integrations/postgres/ticket-conversations.js", () => ({ saveTicketConversation }));

const { escalateUnresolvedConversation } = await import("./auto-escalate.js");

const BASE_INPUT = {
  slackUserId: "U123",
  channelId: "C123",
  nombreClienteFallback: "Usuario de Slack U123",
  textoOriginal: "mi correo es jorge@redtec.ai",
  motivo: "agotó los pasos permitidos",
};

describe("escalateUnresolvedConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSupportTicket.mockResolvedValue("3200000099");
    getCustomerProfile.mockResolvedValue(null);
    getTicketDraft.mockResolvedValue({});
  });

  it("usa el ticket_draft para el producto, resumen y urgencia reales (bug 2026-07-31)", async () => {
    // Regresión: antes de este fix, auto-escalate ignoraba el ticket_draft y siempre
    // creaba el ticket con producto="Otro", resumen=textoOriginal, urgencia="Urgente".
    getTicketDraft.mockResolvedValue({
      nombreCliente: "Jorge Calderón",
      email: "jorge@redtec.ai",
      resumen: "No puede iniciar sesión en Sofi",
      urgencia: "No es urgente",
      tipoSolicitud: "Problema",
      producto: "Sofi",
    });

    await escalateUnresolvedConversation(BASE_INPUT);

    expect(createSupportTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        nombreCliente: "Jorge Calderón",
        email: "jorge@redtec.ai",
        resumen: "No puede iniciar sesión en Sofi",
        urgencia: "No es urgente",
        producto: "Sofi",
      }),
    );
  });

  it("cae a los fallbacks genéricos cuando el draft está vacío", async () => {
    getTicketDraft.mockResolvedValue({});
    getCustomerProfile.mockResolvedValue(null);

    await escalateUnresolvedConversation(BASE_INPUT);

    expect(createSupportTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        nombreCliente: BASE_INPUT.nombreClienteFallback,
        resumen: BASE_INPUT.textoOriginal,
        urgencia: "Urgente",
        tipoSolicitud: "Problema",
        producto: "Otro",
      }),
    );
  });

  it("prioriza datos del draft sobre el perfil guardado", async () => {
    // El draft tiene el email real dado en la conversación; el perfil tiene uno viejo.
    getTicketDraft.mockResolvedValue({ email: "nuevo@redtec.ai", producto: "Isabella" });
    getCustomerProfile.mockResolvedValue({ nombreCliente: "Jorge", email: "viejo@redtec.ai" });

    await escalateUnresolvedConversation(BASE_INPUT);

    expect(createSupportTicket).toHaveBeenCalledWith(
      expect.objectContaining({ email: "nuevo@redtec.ai", producto: "Isabella" }),
    );
  });

  it("limpia el draft y el historial tras crear el ticket, y guarda la correlación ticket↔conversación", async () => {
    await escalateUnresolvedConversation(BASE_INPUT);

    expect(clearTicketDraft).toHaveBeenCalledWith("U123");
    expect(clearHistory).toHaveBeenCalledWith("U123");
    expect(saveTicketConversation).toHaveBeenCalledWith("3200000099", "U123", "C123");
  });

  it("devuelve undefined si Monday falla", async () => {
    createSupportTicket.mockRejectedValue(new Error("Monday down"));

    const result = await escalateUnresolvedConversation(BASE_INPUT);

    expect(result).toBeUndefined();
    expect(saveTicketConversation).not.toHaveBeenCalled();
  });

  it("igual escala aunque falle el lookup del draft en Mongo", async () => {
    getTicketDraft.mockRejectedValue(new Error("Mongo timeout"));

    const result = await escalateUnresolvedConversation(BASE_INPUT);

    expect(result).toBe("3200000099");
    expect(createSupportTicket).toHaveBeenCalled();
  });
});
