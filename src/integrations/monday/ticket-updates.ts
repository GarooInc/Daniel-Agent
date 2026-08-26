import { mondayRequest } from "./client.js";
import { SUPPORT_BOARD_COLUMNS, SUPPORT_BOARD_ID } from "./board.js";

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

const CHANGE_STATUS_MUTATION = `
  mutation MarkTicketReady($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
    change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
      id
    }
  }
`;

// Solo se llama cuando el diagnóstico del Técnico es concreto y resuelve el caso
// (diagnosis.resuelto === true) — en cualquier otro caso el ticket se queda en "Working on it",
// su default. El tablero de producción no tiene un estado "Listo" propio (solo Working on
// it/Done/Stuck/Testing) — decisión 2026-08-26: mapea a "Done".
export async function markTicketReady(itemId: string): Promise<void> {
  await mondayRequest(CHANGE_STATUS_MUTATION, {
    boardId: SUPPORT_BOARD_ID,
    itemId,
    columnId: SUPPORT_BOARD_COLUMNS.estado,
    value: "Done",
  });
}
