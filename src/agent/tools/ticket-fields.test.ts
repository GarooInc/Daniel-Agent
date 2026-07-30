import { describe, expect, it } from "vitest";
import { findMissingFields, mergeTicketFields, REQUIRED_FIELDS } from "./ticket-fields.js";

describe("mergeTicketFields", () => {
  it("prefiere el valor de la primera fuente que lo tenga", () => {
    const extracted = { producto: "Sofi" as const };
    const draft = { producto: "Widget-chatbot" as const, resumen: "no puede iniciar sesión" };
    const profile = { nombreCliente: "Jorge" };

    const merged = mergeTicketFields(extracted, draft, profile);

    expect(merged.producto).toBe("Sofi");
    expect(merged.resumen).toBe("no puede iniciar sesión");
    expect(merged.nombreCliente).toBe("Jorge");
  });

  it("salta una fuente si el campo está undefined en ella, aunque venga primero", () => {
    const extracted = {};
    const draft = { email: "jorge@redtec.com" };

    const merged = mergeTicketFields(extracted, draft);

    expect(merged.email).toBe("jorge@redtec.com");
  });

  it("no incluye campos que ninguna fuente tiene", () => {
    const merged = mergeTicketFields({}, {});
    expect(merged).toEqual({});
  });

  it("no deja que un borrador viejo pise datos ya extraídos de la conversación actual", () => {
    // Caso real que rompió en producción (2026-07-30): un ticket_draft contaminado de una
    // sesión anterior no debe ganarle a lo que el LLM extrajo de la conversación de ahora.
    const extractedFromCurrentConversation = { resumen: "no puede iniciar sesión en Sofi" };
    const staleDraftFromPreviousSession = { resumen: "Problema de facturación", producto: "Widget-chatbot" as const };

    const merged = mergeTicketFields(extractedFromCurrentConversation, staleDraftFromPreviousSession);

    expect(merged.resumen).toBe("no puede iniciar sesión en Sofi");
  });
});

describe("findMissingFields", () => {
  it("devuelve todos los campos requeridos si el borrador está vacío", () => {
    expect(findMissingFields({})).toEqual([...REQUIRED_FIELDS]);
  });

  it("devuelve solo los que faltan", () => {
    const missing = findMissingFields({
      nombreCliente: "Jorge",
      email: "jorge@redtec.com",
      resumen: "no puede iniciar sesión",
    });

    expect(missing).toEqual(["urgencia", "tipoSolicitud", "producto"]);
  });

  it("devuelve vacío cuando están todos los campos requeridos", () => {
    const missing = findMissingFields({
      nombreCliente: "Jorge",
      email: "jorge@redtec.com",
      resumen: "no puede iniciar sesión",
      urgencia: "Urgente",
      tipoSolicitud: "Problema",
      producto: "Sofi",
    });

    expect(missing).toEqual([]);
  });
});
