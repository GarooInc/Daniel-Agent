// Tablero de producción "Soporte y Emergencias" (redtechai.monday.com/boards/5092085472).
// El tablero de pruebas (5101177200) sigue existiendo aparte para no romper pruebas en curso;
// si hace falta apuntar ahí de nuevo, es cuestión de cambiar este ID + los de abajo.
export const SUPPORT_BOARD_ID = 5092085472;

export const SUPPORT_BOARD_COLUMNS = {
  contacto: "text_mm5sq8cs",
  descripcion: "text_mm5sx158",
  categoria: "color_mm5sqqv6",
  canal: "text_mm5twf9z",
  prioridad: "color_mm5wptaq",
  // Labels reales del tablero nuevo: Working on it (default) / Done / Stuck / Testing.
  // No existe un "Listo" propio — ver ticket-updates.ts, markTicketReady ahora mapea a "Done".
  estado: "status",
} as const;
