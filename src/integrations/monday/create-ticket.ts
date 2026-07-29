import { mondayRequest } from "./client.js";
import { SUPPORT_BOARD_COLUMNS, SUPPORT_BOARD_ID } from "./board.js";

export type UrgenciaTicket = "No es urgente" | "Urgente";
export type TipoSolicitudTicket = "Problema" | "Solicitud" | "Pregunta";
export type ProductoTicket = "Isabella" | "Sofi" | "Widget-chatbot" | "Otro";
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
