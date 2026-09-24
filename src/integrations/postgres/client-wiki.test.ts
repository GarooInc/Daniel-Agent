import { describe, expect, it } from "vitest";
import { stripInternalContent } from "./client-wiki.js";

describe("stripInternalContent", () => {
  it("saca una sección completa marcada [INTERNO] hasta el siguiente encabezado del mismo nivel", () => {
    const markdown = [
      "## Resumen",
      "Contenido seguro para el cliente.",
      "",
      "## Sistemas y componentes **[INTERNO]**",
      "Detalle de arquitectura que no debe verse.",
      "",
      "## Escalamiento",
      "Contacto de soporte.",
    ].join("\n");

    const result = stripInternalContent(markdown);

    expect(result).toContain("Resumen");
    expect(result).toContain("Escalamiento");
    expect(result).not.toContain("Sistemas y componentes");
    expect(result).not.toContain("Detalle de arquitectura");
  });

  it("saca una línea suelta que arranca con **[INTERNO]** sin tocar el resto", () => {
    const markdown = [
      "## Resumen",
      "**[INTERNO] Confirmado en vivo**: 1372 contactos, cifra comparativa.",
      "Dato seguro para el cliente.",
    ].join("\n");

    const result = stripInternalContent(markdown);

    expect(result).toContain("Dato seguro para el cliente.");
    expect(result).not.toContain("1372 contactos");
  });

  it("saca una línea con [INTERNO] seguido de más texto antes del cierre de corchete (variante real, ver mundo-verde.md)", () => {
    const markdown = [
      "## Estado actual",
      "Dato seguro para el cliente.",
      "**[INTERNO — hallazgo de seguridad]** Detalle que no debe salir.",
    ].join("\n");

    const result = stripInternalContent(markdown);

    expect(result).toContain("Dato seguro para el cliente.");
    expect(result).not.toContain("hallazgo de seguridad");
  });

  it("devuelve el texto sin cambios si no hay ninguna marca [INTERNO]", () => {
    const markdown = "## Resumen\nTodo esto es seguro.";
    expect(stripInternalContent(markdown)).toBe(markdown);
  });
});
