# RNR y otros clientes menores

> **⚠️ Nota estructural**: este archivo mezcla RNR con **varios clientes ajenos entre sí** (Liga Tenis GT, y una decena de clientes de web/chatbot sin relación entre ellos). Antes de sembrar `client_wiki`, la sección "RNR" es la única que debería cargarse bajo `empresa = RNR`; el resto no debe cargarse como página de ningún cliente tal cual está — son notas internas de inventario, no contenido pensado para responder en el canal de ninguno de esos clientes. Ver `kb/politica-acceso-y-visibilidad.md`.

## RNR — Rock N Rolla (`empresa`: `RNR` — ya existe en las tablas de Daniel)

> **Visibilidad: Cliente** (scoped a RNR). Esta sección sí es específica de RNR.

> Fuentes: `Agent-Support/Daniel-Agent/src/migrate-monday-clientes.ts`, `ESTADO-PROYECTO.md` punto 32, `RedtecPortal/redtec-portal-frontend/src/clients/RocknRolla/`, tablero legacy de Monday.

- En `monday_clientes`, el único mapeo real es "Rock N Rolla" → `RNR`. Tiene dos grupos de WhatsApp con RedTec: uno de soporte ("RedTec x RNR") y otro de tráfico/campañas.
- En el RedTec Portal tiene un módulo propio, **"Talento RocknRolla"**: tabla de aplicaciones/candidatos, filtros, detalle del trabajador, generación de PDF. Es parte de "RR Jobs", su portal de empleo (paginación, filtros, notificaciones, formularios de RRHH).
- También tiene tableros de Monday para gestión de trabajo, con sincronización a Google Calendar (hubo un bug donde los ítems sincronizados quedaban como "Elemento nuevo" sin el nombre real de la reunión — reportado).
- Sus tickets de soporte llegan al tablero de Daniel creados por el propio agente/sistema del cliente (la columna "Cliente" ya viene poblada).
- **Gap**: no hay documentación de qué chatbot o agente conversacional opera RedTec para RNR, si es que existe uno — solo constan estos módulos de portal/gestión.

## Liga Tenis GT (no es un agente de IA — soporte futuro posible) **[INTERNO]**

> Fuentes: `GTL/STATUS.md`, `GTL/Reunion-Entrega-GTL-2026-09-16.md`.

Garoo tomó el control técnico de `ligatenisgt.com`, traspasado por el equipo original. App en Astro (con Firebase functions/rules) + panel de administración en Vite con backend en Railway; frontend en Vercel; pagos con Recurrente (webhooks ya validados el 2026-09-16). Pendiente: terminar de migrar los nameservers a Cloudflare, resolver que `app.ligatenisgt.com` no cargaba (posible tema de certificado SSL tras el cambio de DNS). No es un cliente que Daniel deba soportar hoy — se documenta por si en el futuro se le suma un canal de soporte.

## Otros clientes de web/chatbot (tablero legacy "Support Clients", jul-2025 → feb-2026) **[INTERNO — inventario cruzado, no cargar como página de ningún cliente sin separar antes]**

Clientes que aparecen en el dropdown "Cliente" de ese tablero, con lo que se sabe de cada uno. Ninguno tiene repo propio en Garoo — si un cliente de esta lista escribe a Daniel, es soporte de sitio web o de un chatbot antiguo, no de la plantilla concierge actual:

- **Nación Sushi** (nacion.delivery) — sitio SPA de delivery. Bug abierto (2026-09-22): desde la ficha de un plato, tocar "Delivery"/"Restaurantes" cambia la URL pero no navega.
- **PAEZ** (paez.com, Shopify) — cambios de temporada en el sitio (banners, rebajas, envío gratis). Contacto del cliente: Luis Gaivão.
- **MCN** — sitio con blog/"entradas" frecuentes y catálogo; hubo un bug de layout en la sección "Nosotros".
- **HDS** — chatbot + Room Directory (directorio de hotel); se actualiza mensualmente con actividades y promociones.
- **Kloster** — chatbot con promociones mensuales, menú digital, reservas, agente de reseñas y auto-respuesta a comentarios.
- **Hotel Los Robles / Punta Teonoste / Hotel Los Pasos** — chatbots ManyChat + WhatsApp con analíticas a Google Sheets. Teonoste tuvo un bug donde el bot decía "Hola" en cada mensaje.
- **Fridas, Adriatika** (Room Directory), **Mira Mira, Cacao70, Lacoste, Bloque, Jakes NY Steak, La Pista** (menús web), **Taormina** (tags/usuarios), **Vibbo Tea** (Shopify: pre-order, Kickstarter, Klaviyo), **Boquiteo, Municipalidad Pérez Zeledón** (chatbot), **APN, Ficohsa** (plantilla de broadcast en ManyChat, con límite diario de envíos), **Holdmin** (Social Media Agent), **Paseo**.

## Proyectos de producto (no son soporte de un cliente puntual) **[INTERNO]**

Iniciativas más grandes vistas en Monday, para no confundirlas con clientes: **Agent Satelital** (monitoreo NDVI de cultivos, alertas), **Agent FEL** (facturas SAT en XML + formulario de proveedor → matching → ERP), **Data Agent** (ver también la sección de Spectrum), **Situa.gt** (Digital Broker: perfilado financiero, push a CRM propio + Monday), **CBC Rock the Day** (Pepsi/Gatorade/Salutaris, 8 mercados: Monday + n8n/Evolution + dashboard + Odoo).

## Módulos del RedTec Portal sin cliente/proceso documentado aparte **[INTERNO]**

`Pepsi` (análisis de videos virales), `Ficohsa` (página de llamadas), `Guatecompras` (radar de activaciones OCDS + agente) — existen como organizaciones/servicios del Portal pero no hay documentación de cómo funcionan más allá del nombre del módulo.
