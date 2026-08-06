import type { TicketDraftFields } from "../../integrations/mongo/ticket-draft.js";

export const REQUIRED_FIELDS = ["nombreCliente", "email", "resumen", "urgencia", "tipoSolicitud", "producto"] as const;

export const FIELD_LABELS: Record<(typeof REQUIRED_FIELDS)[number], string> = {
  nombreCliente: "nombre del cliente",
  email: "email",
  resumen: "resumen del problema",
  urgencia: "urgencia (Urgente / No es urgente)",
  tipoSolicitud: "tipo de solicitud (Problema / Solicitud / Pregunta)",
  producto: "producto (Isabella / Sofi / Widget-chatbot / Otro)",
};

export function findMissingFields(fields: TicketDraftFields): (typeof REQUIRED_FIELDS)[number][] {
  return REQUIRED_FIELDS.filter((field) => !fields[field]);
}

const ALL_FIELDS = [...REQUIRED_FIELDS, "queSeIntentoYa"] as const;

// Combina varias fuentes en orden de prioridad (la primera que tenga un valor gana), campo
// por campo. Una sola implementación para las dos veces que esto hacía falta: el borrador
// que arma daniel.ts (extraído por LLM ?? guardado en Mongo ?? perfil del cliente) y lo que
// recibe la tool escalar_a_monday (argumentos del modelo ?? borrador ya calculado).
//
// "" cuenta como ausente, igual que undefined: bug real (2026-08-05) — extractTicketFields
// a veces devuelve nombreCliente/etc. como string vacío en vez de omitir el campo (el prompt
// de extracción incluso lo sugiere: "si un dato no aparece, dejalo vacío"). Como "" !== undefined,
// tapaba silenciosamente un valor real y más confiable de una fuente de menor prioridad (el
// perfil guardado en `users`), y además contaba como "campo presente" aunque findMissingFields
// lo detectara igual como faltante por ser falsy — resultado: Daniel volvía a pedir un dato que
// ya tenía guardado en el perfil del cliente.
function hasValue(value: unknown): boolean {
  return value !== undefined && value !== "";
}

export function mergeTicketFields(...sources: TicketDraftFields[]): TicketDraftFields {
  const result: TicketDraftFields = {};
  for (const field of ALL_FIELDS) {
    for (const source of sources) {
      const value = source[field];
      if (hasValue(value)) {
        (result as Record<string, unknown>)[field] = value;
        break;
      }
    }
  }
  return result;
}
