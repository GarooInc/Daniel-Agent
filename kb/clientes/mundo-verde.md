# Mundo Verde (`empresa`: `Mundo Verde` — ya existe en `whatsapp_groups`)

> Bravante aparece en `whatsapp_groups` como cliente separado, pero según lo investigado es (o incluye) una compañía del grupo dentro del mismo Odoo de Mundo Verde. **Decisión de Jorge (2026-09-24)**: fusionar bajo `empresa = Mundo Verde` mientras se confirma la relación exacta con el cliente/Fernando — esta página cubre ambos. Fuentes: `RedtecPortal/mundo-verde-workflows/README.md` y `STATUS.md`, `RedtecPortal/redtec-portal-backend/PROYECTO_ODOO.md`, `RedtecPortal/redtec-portal-frontend/CLAUDE.md`, tickets de Monday "WhatsApp grupo (AGMundoV)".
>
> **Visibilidad por defecto: Cliente** (scoped a Mundo Verde/Bravante). Las líneas marcadas **[INTERNO]** son detalle de arquitectura o cifras comparativas de negocio — nunca deben responderse en el canal de este cliente. Ver `kb/politica-acceso-y-visibilidad.md`.

## Resumen

RedTec automatiza dos cosas distintas para el grupo Mundo Verde, que conviene no confundir:

1. **Facturación**: recepción, conciliación y contabilización de facturas electrónicas (FEL Guatemala) de proveedores contra el **Odoo** del grupo (varias compañías; órdenes de compra con prefijos como `OC-BRA`, `OC-ADP`), más un portal de solicitudes de compra/aprobación y un portal de proveedores.
2. **Bravante — The Forest Residence**: proyecto inmobiliario (torres **Ígnea** y **Etérea**, Zona 16 Santa Rosalía, 96 unidades) con su propio CRM operativo (`mv_*`), atendido por los agentes **Isabella** (funnel de prospectos) y **Arturo** (back-office: cotizaciones, documentos, sync con Odoo, en el grupo de WhatsApp «RedTec <> Bravante»).

## Sistemas y componentes **[INTERNO]**

**Facturación (n8n, 11 workflows):**
- `MUNDO VERDE - FACTURAS CORREO` — lee por Gmail las notificaciones del SAT cada minuto.
- `MUNDO VERDE - FORMULARIO` — webhook `POST /facturas`, carga manual de PDF/XML + orden de compra desde el portal.
- `Mundo Verde - MATCH ODOO` — el orquestador: valida contra la OC, confirma, crea el asiento contable, adjuntos, cuenta analítica, conceptos.
- `FACTURAS PARA ANALISIS IA` — relee el PDF con IA (Gemini + GPT-4o-mini) y compara contra lo cargado en Odoo.
- `INGRESA CONCEPTO DETALLE FACTURA` (2 variantes), `Asignar Cuenta Analitica`, `Matchear Tablas` (corre 10:00 y 16:00).
- Reportes semanales (viernes 14:00) de facturas sin confirmar / sin matchear. `ERROR HANDLER`.
- RedTec Portal: `/mundo-verde/invoices` (envío de facturas, asignación PDF→presupuesto BIM, aprobación en 3 columnas), solicitudes de compra/anticipo/reembolso con aprobación por correo, "Solicitudes pendientes (Odoo)" con aprobación para pago (fecha + banco, escribe campos `x_studio_*` en Odoo), portal público de proveedores `/proveedor-factura` (verifica NIT, dashboard de pagos, carga de factura), `/registro-proveedor`.
- Datos: MongoDB (colecciones `factura`, `formulario`, `facturas-odoo`), Postgres `redtec_ai_master` (solicitudes, auditoría, `rp_facturas_ingesta`), correos vía Resend.

**Bravante:** Odoo de producción (estado de unidades, órdenes, DPI de deudores), Monday "Bravante-Pagos" (sync), Meta Instagram/Página, Evolution API, dashboard con cotizador, PDFs servidos desde `mvagent.redtecsystems.com`.

## Cómo funciona (facturación)

Una factura entra por **dos puertas** (correo del SAT o formulario del portal), se guarda cruda en Mongo, se empareja entre ambas fuentes (por NIT/serie/número) y `MATCH ODOO` la contabiliza. Reglas: una factura duplicada (misma Serie + Número) en Odoo se rechaza automáticamente; sin saldo presupuestario no se aprueba; anticipo y reembolso son mutuamente excluyentes; toda acción queda auditada.

## Reglas de negocio — Bravante

Enganche: 20% en Torre Ígnea, 30% en Torre Etérea. Fecha de entrega: **a partir de mayo de 2028** (ojo: el PDF de KB de septiembre todavía dice "~2027" — está desactualizado, usar mayo 2028). Vigencia de una cotización: 15 días desde que se genera. Preventa desde USD 340k (modelo Magma). Modelos de unidad: Magma, Riolita, Basalto, Novara, Toba, Ignis, Lumina (PH). Asesora por defecto: Anna Pineda (pool: Anna, Mariagabriela "Gaby" Moros, Ana Ingrid Ramila).

## Incidentes conocidos y resolución **[INTERNO]**

**Facturación:**
- Recaídas del bug de `_id` de Mongo (`BSONError` / "24 character hex string") en `MATCH ODOO` y `Matchear Tablas` (2026-09-14/15) → helper `toHexId()`. **Importante**: un retry manual no sirve una vez aplicado el fix — hay que volver a subir la factura.
- 2026-09-15: `SERIE`/`NRO_FACTURA` se leen por OCR/LLM del PDF (no del XML) → errores de lectura (0 vs. O confundidos); se agregó matcheo tolerante. El fix definitivo (leer del XML) sigue pendiente.
- 2026-09-15: comparación de totales con igualdad estricta de punto flotante causaba falsos rechazos → se agregó tolerancia.
- 2026-09-15: falso "FACTURA YA EXISTE EN ODOO" entre distintas compañías del mismo grupo → se agregó filtro `move_type = in_invoice`.
- 2026-09-18: falsas discrepancias por **retención de ISR** (Odoo guarda los totales netos de la retención) → cotejo ahora tolera neto vs. bruto y muestra la fila "Retención ISR" explícita.
- 2026-09-17: el backend se caía al redeployar por faltar la carpeta `support-panel/` en el Dockerfile → corregido.

**Bravante:**
- Metros cuadrados en 0.00 / parqueos en 0 en el PDF de cotización → corregido.
- Precios desactualizados en el cotizador (unidades Riolita, Ignis A-703) → se corrigen actualizando la tabla `mv_units`.
- Faltaba la imagen de planta `toba.png` → corregido.
- Una unidad quedó marcada como vendida por error en Odoo, y otra como "Bloqueada" (ese estado impide cotizarla) → ambos casos se resuelven corrigiendo/habilitando en Odoo.
- Brochure incorrecto publicado en Instagram → corregido.
- El funnel de seguimiento enviaba mensajes en horarios incorrectos → corregido.

## Escalamiento

**Facturación:** contabilidad/tesorería del cliente (aprobaciones, revisión de discrepancias); encargada de ingreso de facturas (reclamos de facturas rechazadas). **Bravante:** el pool de asesoras de ventas. Técnico en ambos casos: implementador RedTec.

**[INTERNO]** Admin del proyecto: Fernando Ortiz. Nota operativa: hoy los correos de error de facturación van a una sola persona hardcodeada — pendiente de generalizar.

## Estado actual

**Facturación:** en producción con reclamos diarios de matcheo. La aprobación que crea documentos directamente en Odoo (Fase 12) y el "Proceso 2" (ingreso masivo sin orden de compra) todavía no están construidos.

**[INTERNO — hallazgo de seguridad, ver también `kb/politica-acceso-y-visibilidad.md`]** Pendientes de negocio: las credenciales de Odoo están guardadas en Mongo (deberían migrar a una credencial de n8n), destinatarios de alertas hardcodeados, CORS abierto, una orden de compra duplicada sin resolver. Se planteó migrar los workflows de n8n al backend, no iniciado.

**Bravante:** casi todos los incidentes listados arriba están resueltos; quedan solicitudes de reportes pendientes de construir (absorción por torre, embudo desde "Contactado", ventas por origen de lead, log centralizado de cotizaciones por asesor, recordatorios de pago a clientes con cuotas vencidas, exportar compradores con reserva a Excel/PDF).

**[INTERNO] Confirmado en vivo en crm.redtec.ai (2026-09-22)**: es el tenant **más activo de toda la plataforma** — 2654 contactos, 5 conversaciones simultáneas, 104 mensajes ese día, agente Isabella sobre `deepseek/deepseek-v4.1-flash`. Es el único tenant, junto con Cofiño y Rosero Construye, con **los 6 agentes del roster activos** (Isabella, Sofi, Walter, Arturo, Daniel, Marco) — es decir, acá Arturo (back-office) y Daniel sí están habilitados dentro del propio panel, no solo por WhatsApp/n8n aparte.
