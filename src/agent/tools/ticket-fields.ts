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
