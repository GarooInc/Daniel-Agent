import { mondayRequest } from "./client.js";
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

export async function createSupportTicket(ticket: NuevoTicket): Promise<string> {
  const columnValues = {
    [SUPPORT_BOARD_COLUMNS.email]: ticket.email,
    [SUPPORT_BOARD_COLUMNS.resumen]: ticket.resumen,
    [SUPPORT_BOARD_COLUMNS.urgencia]: { label: ticket.urgencia },
    [SUPPORT_BOARD_COLUMNS.tipoSolicitud]: { label: ticket.tipoSolicitud },
    [SUPPORT_BOARD_COLUMNS.producto]: { label: ticket.producto },
    [SUPPORT_BOARD_COLUMNS.canalOrigen]: { label: ticket.canalOrigen },
    [SUPPORT_BOARD_COLUMNS.queSeIntentoYa]: ticket.queSeIntentoYa,
  };

  const data = await mondayRequest<CreateItemResponse>(CREATE_ITEM_MUTATION, {
    boardId: SUPPORT_BOARD_ID,
    itemName: ticket.nombreCliente,
    columnValues: JSON.stringify(columnValues),
  });

  if (!data.create_item) {
    throw new Error("Monday no devolvió el item creado.");
  }

  return data.create_item.id;
}
