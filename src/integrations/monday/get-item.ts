import { mondayRequest } from "./client.js";

// Lado de lectura, separado de ticket-updates.ts (que solo escribe). Hace falta para
// monday-webhook-handler.ts: el evento nativo de "cambió de columna" trae el valor de la
// columna que cambió (status), pero no el resto de las columnas del item — para leer "Cliente"
// hay que pedirlo aparte.
const GET_COLUMN_VALUE_QUERY = `
  query GetItemColumnValue($itemId: ID!, $columnId: String!) {
    items(ids: [$itemId]) {
      column_values(ids: [$columnId]) {
        text
      }
    }
  }
`;

type GetColumnValueResponse = {
  items: { column_values: { text: string | null }[] }[];
};

// null tanto si el item no existe como si la columna viene vacía — el caller ya trata ambos
// casos igual (no hay a quién notificar por WhatsApp sin un valor de cliente confiable).
export async function getItemColumnValue(itemId: string, columnId: string): Promise<string | null> {
  const data = await mondayRequest<GetColumnValueResponse>(GET_COLUMN_VALUE_QUERY, { itemId, columnId });
  const text = data.items[0]?.column_values[0]?.text;
  return text || null;
}
