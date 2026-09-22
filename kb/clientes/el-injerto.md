# El Injerto (`empresa` propuesta: `El Injerto`)

> Alias: INJERTO, El Injerto Café, Finca El Injerto. **No existe todavía en `whatsapp_groups`/`monday_clientes`/`tech_agents` de Daniel** — nombre a confirmar antes de sembrar. Fuentes: `AGENT-INJERTO/wiki/entities/injerto.md`, `AGENT-INJERTO/STATUS.md`, `AGENT-INJERTO/CLAUDE.md`.
>
> **Visibilidad por defecto: Cliente** (scoped a El Injerto). Las secciones marcadas **[INTERNO]** son detalle de arquitectura/diagnóstico de RedTec — nunca deben responderse en el canal de este cliente. Ver `kb/politica-acceso-y-visibilidad.md`.

## Resumen

Marca guatemalteca de café de especialidad (Finca El Injerto, Huehuetenango). RedTec construyó **"Lucia", E-Barista de El Injerto** (agente n8n, plantilla concierge — ver `kb/plataforma/redtec.md`), que **reemplazó por completo** al bot anterior del cliente. Recomienda café, explica catálogo/finca/recetas y redirige a compra por el sitio web (Shopify); **no toma pedidos ni conoce el estado de pedidos** (deriva a WhatsApp humano).

## Sistemas y componentes **[INTERNO]**

- n8n, carpeta `INJERTO/AGENT`: `INJERTO_PRINCIPAL`, `INJERTO_KB_SEARCH`, `INJERTO_NOTIFICATIONS`, `INJERTO_Vectorizar KB` (manual), `INJERTO_ANALYTICS_SUMMARY` (cada 10 min → Google Sheet, pestaña `Analytics_Nuevo_Bot`), `INJERTO - ERROR HANDLER`.
- ManyChat propio: WhatsApp + Instagram + Messenger conectados desde 2026-09-01.
- MongoDB Atlas propio (KB de 36 chunks, índice `injerto_vector_index`), OpenRouter propio; Redis/Gmail compartidos con Garoo.
- Sitio Shopify: categorías Blend/Variedad Pura/Varios, inventario manual diario, pickup, Escuela de Café, ubicaciones con Waze. Integración **Shopify → Fénix** para facturación.

## Cómo funciona

Plantilla concierge estándar (ver `kb/plataforma/redtec.md`). Categorías que escalan por correo: `b2b_cafe_verde` (cualquier consulta B2B/mayoreo), `empleo`, `colaboracion_redes`, `pago_transferencia`, `escalamiento`. Al cerrar un handoff comparte también el link de WhatsApp humano del cliente. Pide teléfono opcional al cerrar una compra (Instagram/Messenger no traen teléfono).

## Incidentes conocidos y resolución **[INTERNO]**

- 2026-09-01: `Send to ManyChat` fallaba (tag deprecado por Meta + `content.type` null) → corregido.
- 2026-09-01: anti-spam no atómico → nodo `SPAM INCR ATOMIC`.
- 2026-09-01: KB duplicada (72 docs en vez de 36) → wiring de `Delete documents` corregido.
- 2026-09-03: ante un reclamo el bot improvisó ofrecer reembolso/reemplazo → guardrail: nunca ofrecer reembolsos ni redactar compensaciones, solo escalar.
- 2026-09-11: 503 transitorio de Google Sheets en ANALYTICS → reintento automático.
- 2026-09-15: `Update User`/`Guardar Contacto` fallaban con `BSONError` para usuarios recurrentes que daban teléfono/email → ahora matchean por `manychat_id`; se reanudaron las conversaciones afectadas.
- 2026-09-18 (ticket Monday `3233234632`): órdenes de Shopify no llegaban a Fénix, descuadre de ventas en domingos/feriados → resuelto.

## Escalamiento

B2B/mayoreo → bandeja B2B de la finca. Empleo/colaboraciones/pagos/quejas → bandejas de domicilio y cafetería. Técnico: implementación RedTec (el Error Handler manda correo al implementador).

## Estado actual (2026-09-15)

En producción con tráfico real en los 3 canales; sin pendientes técnicos abiertos. Limitación conocida: no hay plantillas de WhatsApp aprobadas para escribir fuera de la ventana de 24 h de Meta.
