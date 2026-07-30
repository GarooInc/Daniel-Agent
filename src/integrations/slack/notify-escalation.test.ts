import { describe, expect, it } from "vitest";
import { escapeMrkdwn } from "./notify-escalation.js";

describe("escapeMrkdwn", () => {
  // Regresión de seguridad (2026-07-30): texto crudo del cliente llegaba sin escapar a los
  // bloques mrkdwn de Slack, permitiendo un link clickeable disfrazado en el canal interno
  // #escalacion (ver ESTADO-PROYECTO.md).
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
