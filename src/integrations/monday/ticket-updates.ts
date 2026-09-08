import { mondayRequest } from "./client.js";
import { SUPPORT_BOARD_COLUMNS, SUPPORT_BOARD_ID, type EstadoTicket } from "./board.js";
import { PRIORIDAD_BY_URGENCIA, type UrgenciaTicket } from "./create-ticket.js";

// Actualiza un ticket ya creado (create-ticket.ts) con lo que encontró el Agente Técnico —
// para que alguien del equipo de soporte que solo mira Monday (nunca Slack) vea el diagnóstico
// sin depender del canal privado del cliente. Ver agent/deliver-tech-diagnosis.ts.
const ADD_UPDATE_MUTATION = `
  mutation AddTicketUpdate($itemId: ID!, $body: String!) {
    create_update(item_id: $itemId, body: $body) {
      id
    }
  }
`;

export async function addTicketUpdate(itemId: string, body: string): Promise<void> {
  await mondayRequest(ADD_UPDATE_MUTATION, { itemId, body });
}

const CHANGE_SIMPLE_VALUE_MUTATION = `
  mutation ChangeSimpleColumnValue($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
    change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
      id
    }
  }
`;

async function changeColumnValue(itemId: string, columnId: string, value: string): Promise<void> {
  await mondayRequest(CHANGE_SIMPLE_VALUE_MUTATION, {
    boardId: SUPPORT_BOARD_ID,
    itemId,
    columnId,
    value,
  });
}

// Solo se llama cuando el diagnóstico del Técnico es concreto y resuelve el caso
// (diagnosis.resuelto === true) — en cualquier otro caso el ticket se queda en "Working on it",
// su default. El tablero de producción no tiene un estado "Listo" propio (solo Working on
// it/Done/Stuck/Testing) — decisión 2026-08-26: mapea a "Done".
export async function markTicketReady(itemId: string): Promise<void> {
  await changeColumnValue(itemId, SUPPORT_BOARD_COLUMNS.estado, "Done");
}

// Las dos de abajo son para tools/modify-ticket.ts (punto 30 de ESTADO-PROYECTO.md, pedido de
// Fernando 2026-09-08): el cliente puede pedirle a Daniel que cambie la urgencia o el estado de
// un ticket ya escalado, no solo agregarle info.
export async function changeTicketPriority(itemId: string, urgencia: UrgenciaTicket): Promise<void> {
  await changeColumnValue(itemId, SUPPORT_BOARD_COLUMNS.prioridad, PRIORIDAD_BY_URGENCIA[urgencia]);
}

export async function changeTicketStatus(itemId: string, estado: EstadoTicket): Promise<void> {
  await changeColumnValue(itemId, SUPPORT_BOARD_COLUMNS.estado, estado);
}
