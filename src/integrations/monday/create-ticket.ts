import { mondayRequest, MondayApiError } from "./client.js";
import { SUPPORT_BOARD_COLUMNS, SUPPORT_BOARD_ID } from "./board.js";

// Arrays en runtime (no solo tipos) para que agent/tools/escalate-to-monday.ts y
// agent/extract-ticket-fields.ts puedan construir sus schemas de zod a partir de la misma
// fuente, en vez de retipear los mismos literales en cada lugar.
export const URGENCIA_VALUES = ["No es urgente", "Urgente"] as const;
export type UrgenciaTicket = (typeof URGENCIA_VALUES)[number];

export const TIPO_SOLICITUD_VALUES = ["Problema", "Solicitud", "Pregunta"] as const;
export type TipoSolicitudTicket = (typeof TIPO_SOLICITUD_VALUES)[number];

export const PRODUCTO_VALUES = ["Isabella", "Sofi", "Widget-chatbot", "Otro"] as const;
export type ProductoTicket = (typeof PRODUCTO_VALUES)[number];

export type CanalOrigen = "widget" | "whatsapp" | "instagram" | "messenger" | "telegram" | "default" | "slack";

export type NuevoTicket = {
  nombreCliente: string;
  email: string;
  resumen: string;
  urgencia: UrgenciaTicket;
  tipoSolicitud: TipoSolicitudTicket;
  producto: ProductoTicket;
  canalOrigen: CanalOrigen;
  queSeIntentoYa: string;
};

type CreateItemResponse = {
  create_item: { id: string } | null;
};

const CREATE_ITEM_MUTATION = `
  mutation CreateSupportTicket($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
    create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
      id
    }
  }
`;

// El tablero de producción no tiene columnas propias para email/producto/queSeIntentoYa
// (a diferencia del tablero de pruebas) — decisión 2026-08-26: se incluyen como texto dentro
// de Descripcion en vez de perderlos, aunque eso signifique que dejan de ser filtrables como
// columna separada en Monday.
function buildDescripcion(ticket: NuevoTicket): string {
  return [
    ticket.resumen,
    `Email: ${ticket.email}`,
    `Producto: ${ticket.producto}`,
    `Qué se intentó: ${ticket.queSeIntentoYa}`,
  ].join("\n\n");
}

// tipoSolicitud (Problema/Solicitud/Pregunta) no tiene columna homóloga — se mapea a la
// Categoría del tablero nuevo (Bug/Pregunta/Solicitud). "Problema" del cliente se modela como
// "Bug" porque en la práctica son incidencias sobre algo que no funciona como debería.
const CATEGORIA_BY_TIPO_SOLICITUD: Record<TipoSolicitudTicket, string> = {
  Problema: "Bug",
  Solicitud: "Solicitud",
  Pregunta: "Pregunta",
};

// urgencia (No es urgente/Urgente) no tiene columna homóloga — se mapea a Prioridad (P1-P4)
// del tablero nuevo. Decisión 2026-08-26: deja P1 Crítico y P4 Bajo libres para que el equipo
// humano los ajuste manualmente, porque Daniel no distingue esos extremos hoy.
const PRIORIDAD_BY_URGENCIA: Record<UrgenciaTicket, string> = {
  Urgente: "P2 Alto",
  "No es urgente": "P3 Medio",
};

export async function createSupportTicket(ticket: NuevoTicket): Promise<string> {
  const columnValues = {
    [SUPPORT_BOARD_COLUMNS.contacto]: ticket.nombreCliente,
    [SUPPORT_BOARD_COLUMNS.descripcion]: buildDescripcion(ticket),
    [SUPPORT_BOARD_COLUMNS.categoria]: { label: CATEGORIA_BY_TIPO_SOLICITUD[ticket.tipoSolicitud] },
    [SUPPORT_BOARD_COLUMNS.canal]: ticket.canalOrigen,
    [SUPPORT_BOARD_COLUMNS.prioridad]: { label: PRIORIDAD_BY_URGENCIA[ticket.urgencia] },
  };

  const data = await mondayRequest<CreateItemResponse>(CREATE_ITEM_MUTATION, {
    boardId: SUPPORT_BOARD_ID,
    itemName: ticket.nombreCliente,
    columnValues: JSON.stringify(columnValues),
  });

  if (!data.create_item) {
    throw new MondayApiError("Monday no devolvió el item creado.");
  }

  return data.create_item.id;
}
