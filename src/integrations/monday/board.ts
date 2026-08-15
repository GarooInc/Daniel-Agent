export const SUPPORT_BOARD_ID = 5101177200;

export const SUPPORT_BOARD_COLUMNS = {
  email: "text",
  resumen: "text1",
  urgencia: "status6",
  tipoSolicitud: "status4",
  producto: "color_mm5qwh54",
  canalOrigen: "color_mm5p5k5s",
  queSeIntentoYa: "long_text_mm5per1v",
  // No se setea al crear el ticket (Monday lo deja en su default "En curso") — solo la usa
  // integrations/monday/ticket-updates.ts para mover el ticket a "Listo" cuando el Agente
  // Técnico entrega un diagnóstico que resuelve el caso. Labels reales confirmadas por API:
  // "En curso" (default) / "Listo" / "Enviado" / "Rechazado".
  estado: "status2",
} as const;
