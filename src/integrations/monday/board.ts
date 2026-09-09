// Tablero de producción "Soporte y Emergencias" (redtechai.monday.com/boards/5092085472).
// El tablero de pruebas (5101177200) sigue existiendo aparte para no romper pruebas en curso;
// si hace falta apuntar ahí de nuevo, es cuestión de cambiar este ID + los de abajo.
export const SUPPORT_BOARD_ID = 5092085472;

export const SUPPORT_BOARD_COLUMNS = {
  contacto: "text_mm5sq8cs",
  // Poblada por el agente de cada cliente al crear su propio ticket, no por Daniel — y no
  // siempre (ver monday-webhook-handler.ts). Confirmada en vivo 2026-09-09 vía get_board_info.
  cliente: "text_mm5s75rw",
  descripcion: "text_mm5sx158",
  categoria: "color_mm5sqqv6",
  canal: "text_mm5twf9z",
  prioridad: "color_mm5wptaq",
  // Labels reales del tablero nuevo: Working on it (default) / Done / Stuck / Testing.
  // No existe un "Listo" propio — ver ticket-updates.ts, markTicketReady ahora mapea a "Done".
  estado: "status",
} as const;

// Labels reales de la columna "estado" del tablero nuevo — ver tools/modify-ticket.ts
// (Daniel puede cambiar el estado de un ticket ya escalado si el cliente lo pide).
export const ESTADO_VALUES = ["Working on it", "Done", "Stuck", "Testing"] as const;
export type EstadoTicket = (typeof ESTADO_VALUES)[number];
