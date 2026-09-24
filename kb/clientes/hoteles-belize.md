# Hoteles Belize — Itz'ana y Ka'ana (`empresa`: `Hoteles Belize`)

> Alias: Itz'ana, Ka'ana, ITZ, KAA, KNN, HotelesBelize. **No existe todavía en las tablas de Daniel.** **Decisión de Jorge (2026-09-24)**: una sola `empresa` "Hoteles Belize" con secciones por propiedad — comparten cuenta ManyChat, workflows y KB (solo se separan por el campo `propiedad`). Fuentes: `Agent-Belize/CLAUDE.md`, `Agent-Belize/wiki/architecture.md`, `Agent-Belize/wiki/status.md`, `Agent-Belize/wiki/roadmap.md`.
>
> **Visibilidad por defecto: Cliente** (scoped a Hoteles Belize). Las secciones marcadas **[INTERNO]** son detalle de arquitectura/diagnóstico de RedTec — nunca deben responderse en el canal de este cliente. Ver `kb/politica-acceso-y-visibilidad.md`.

## Resumen

Concierge pre-reserva para dos hoteles de lujo en Belice (Itz'ana y Ka'ana). Una plataforma compartida con base de conocimientos por propiedad. **Es el agente base** del que salieron El Injerto, El Convento y Wyndham Guatemala (en ese orden de adaptación).

## Sistemas y componentes **[INTERNO]**

- Una sola cuenta ManyChat multi-propiedad (el campo `propiedad`/`hoteles_propiedad` distingue el hotel) + widget web embebible. Webhook `https://agentsprod.redtec.ai/webhook/hotels-agent`.
- Workflows: `ITZ PRINCIPAL AGENT`, `KB_SEARCH`, `ITZ NOTIFICATIONS`, `ITZ VECTORIZAR - KB` (manual).
- MongoDB Atlas (credencial `HOTELS`): KB Itz'ana 39 chunks, Ka'ana 25.
- Reservas: Itz'ana con motor propio (iHotelier); Ka'ana con TravelClick (deep link con `RoomTypeID`).
- Bandeja de leads en el RedTec Portal: `src/clients/HotelesBelize/Leads`.
- `Itzana_Notifications` fue históricamente compartido con `INJERTO_PRINCIPAL` (misma cuenta n8n) — verificar si sigue así antes de tocar uno pensando que no afecta al otro.

## Cómo funciona

Plantilla concierge + flujo guiado de reserva (fechas, tamaño de grupo, edades, tipo de grupo: romántico/familia/grupo grande) y deep link al motor de reservas correspondiente. Pruebas: usar `manychat_id`/`session_id` con prefijo `TEST_` para no generar correos reales al hotel. Gotcha conocido: el widget manda el payload envuelto en `body`, ManyChat sin envolver — un payload con la forma equivocada cae en la rama de ManyChat sin lanzar error visible.

## Incidentes conocidos y resolución **[INTERNO]**

- 2026-09-09: el bot respondió en español a un huésped que escribía en inglés (rama EMPLEO del prompt) → corregido.
- 2026-09-11: Ka'ana alineada al prompt oficial (routing de correos, identidad de marca, KB corregida) y re-vectorizada (tenía 47 documentos viejos duplicados).
- 2026-09-14: 4 variantes del bug de `_id` de Mongo (persistencia de contacto y de usuario recurrente) → `toHex()` defensivo.
- 2026-09-17: `Send to ManyChat` devolvió "400 Subscriber does not exist" con un contacto real de Ka'ana; causa raíz sin confirmar (parece del lado de ManyChat). Mitigación ya activa: si el envío falla, se dispara automáticamente un correo de escalamiento al hotel con el mensaje que no se pudo entregar.
- Room Directory de Itz'ana: ticket abierto en Monday (`3236634571`, 2026-09-21) — el Front Desk Manager no puede entrar; "Forgotten admin password" dice haber enviado el link pero no llega. Escalado a Fernando Ortiz.

## Escalamiento

Por categoría y propiedad, a las bandejas del hotel correspondiente: reservas, empleo/HR, PR, concierge/escalamiento.

## Estado actual

Producción estable con tráfico real en widget/Messenger/Instagram. Pendiente externo: falta el `RoomTypeID` por tipo de habitación de Itz'ana (lo tiene que dar el hotel). Pendiente de producto: push de leads a Monday.com, soft-auth de huésped recurrente. Próxima fase, no construida: E-Concierge in-stay (durante la estadía, no solo pre-reserva).

## Fuera del alcance de este agente (para no confundir con Daniel)

Itz'ana tiene planeados **boletines financieros automáticos desde NetSuite** (comparativos de periodo, variaciones de presupuesto) — es un proyecto de reporting financiero interno del hotel, no del chatbot de huéspedes.
