import { beforeEach, describe, expect, it, vi } from "vitest";

const { conversationsListMock, postMessageMock } = vi.hoisted(() => ({
  conversationsListMock: vi.fn().mockResolvedValue({ channels: [{ id: "C12345678", name: "escalacion" }] }),
  postMessageMock: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@slack/web-api", () => {
  return {
    WebClient: vi.fn().mockImplementation(function () {
      return {
        conversations: { list: conversationsListMock },
        chat: { postMessage: postMessageMock },
      };
    }),
  };
});

import { _resetCachedChannelIdForTests, escapeMrkdwn, notifyEscalation } from "./notify-escalation.js";

describe("escapeMrkdwn", () => {
  it("neutraliza un link mrkdwn disfrazado para que no sea clickeable", () => {
    const malicious = "<https://evil-phishing.com|Click acá para verificar tu cuenta>";
    const escaped = escapeMrkdwn(malicious);

    expect(escaped).not.toContain("<https://evil-phishing.com|");
    expect(escaped).toBe("&lt;https://evil-phishing.com|Click acá para verificar tu cuenta&gt;");
  });

  it("escapa & antes que < y > para no doble-escapar entidades ya escapadas", () => {
    expect(escapeMrkdwn("A & B")).toBe("A &amp; B");
  });

  it("deja intacto el texto sin caracteres especiales", () => {
    expect(escapeMrkdwn("no puedo iniciar sesión en Sofi")).toBe("no puedo iniciar sesión en Sofi");
  });
});

describe("notifyEscalation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCachedChannelIdForTests();
  });

  it("resuelve el ID del canal #escalacion y publica el mensaje formateado en Slack", async () => {
    conversationsListMock.mockResolvedValueOnce({
      channels: [{ id: "C12345678", name: "escalacion" }],
    });

    await notifyEscalation({
      ticketId: "3999999999",
      nombreCliente: "Juan Pérez",
      email: "juan@example.com",
      resumen: "Problema con <script>alert(1)</script>",
      urgencia: "Urgente",
      tipoSolicitud: "Problema",
      producto: "Sofi",
      queSeIntentoYa: "Reinicio de app & cambio de pass",
    });

    expect(conversationsListMock).toHaveBeenCalled();
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C12345678",
        text: expect.stringContaining("3999999999"),
        blocks: expect.arrayContaining([
          expect.objectContaining({
            type: "header",
            text: expect.objectContaining({ text: "🎫 Ticket #3999999999 — Urgente" }),
          }),
        ]),
      }),
    );
  });

  it("si no encuentra el canal en Slack loguea una advertencia sin romper la app", async () => {
    conversationsListMock.mockResolvedValueOnce({ channels: [] });

    await notifyEscalation({
      ticketId: "3999999999",
      nombreCliente: "Juan Pérez",
      email: "juan@example.com",
      resumen: "Problema con Sofi",
      urgencia: "Urgente",
      tipoSolicitud: "Problema",
      producto: "Sofi",
      queSeIntentoYa: "Reinicio",
    });

    expect(postMessageMock).not.toHaveBeenCalled();
  });
});
