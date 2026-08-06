import { describe, expect, it } from "vitest";
import { toSlackMrkdwn } from "./format.js";

describe("toSlackMrkdwn", () => {
  it("convierte negrita de Markdown estándar (**texto**) a mrkdwn de Slack (*texto*)", () => {
    expect(toSlackMrkdwn("Listo, **#3141811663** en Monday.com.")).toBe("Listo, *#3141811663* en Monday.com.");
  });

  it("convierte negrita con guion bajo (__texto__) también", () => {
    expect(toSlackMrkdwn("__Producto:__ Isabella")).toBe("*Producto:* Isabella");
  });

  it("convierte varias negritas en el mismo texto", () => {
    expect(toSlackMrkdwn("- **Producto:** Isabella\n- **Urgencia:** Urgente")).toBe(
      "- *Producto:* Isabella\n- *Urgencia:* Urgente",
    );
  });

  it("convierte links de Markdown ([texto](url)) al formato <url|texto> de Slack", () => {
    expect(toSlackMrkdwn("Mirá [nuestra guía](https://redtec.com/guia) para más info")).toBe(
      "Mirá <https://redtec.com/guia|nuestra guía> para más info",
    );
  });

  it("deja intacto el texto sin formato especial", () => {
    expect(toSlackMrkdwn("Hola, ¿en qué te ayudo?")).toBe("Hola, ¿en qué te ayudo?");
  });
});
