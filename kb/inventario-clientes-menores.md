# Inventario de clientes menores — no cargar como `client_wiki`

> **Visibilidad: Interno (archivo completo).** Notas internas de inventario cruzado, no contenido
> pensado para responder en el canal de ninguno de estos clientes. Ver
> `kb/politica-acceso-y-visibilidad.md`. Separado el 2026-09-24 de `kb/clientes/rnr-y-otros.md`
> (RNR, el único con `client_wiki` real, quedó en `kb/clientes/rnr.md`).

## Liga Tenis GT (no es un agente de IA — soporte futuro posible)

> Fuentes: `GTL/STATUS.md`, `GTL/Reunion-Entrega-GTL-2026-09-16.md`.

Garoo tomó el control técnico de `ligatenisgt.com`, traspasado por el equipo original. App en Astro (con Firebase functions/rules) + panel de administración en Vite con backend en Railway; frontend en Vercel; pagos con Recurrente (webhooks ya validados el 2026-09-16). Pendiente: terminar de migrar los nameservers a Cloudflare, resolver que `app.ligatenisgt.com` no cargaba (posible tema de certificado SSL tras el cambio de DNS). No es un cliente que Daniel deba soportar hoy — se documenta por si en el futuro se le suma un canal de soporte.

## Otros clientes de web/chatbot (tablero legacy "Support Clients", jul-2025 → feb-2026)

Clientes que aparecen en el dropdown "Cliente" de ese tablero, con lo que se sabe de cada uno. Ninguno tiene repo propio en Garoo — si un cliente de esta lista escribe a Daniel, es soporte de sitio web o de un chatbot antiguo, no de la plantilla concierge actual:

- **Nación Sushi** (nacion.delivery) — sitio SPA de delivery. Bug abierto (2026-09-22): desde la ficha de un plato, tocar "Delivery"/"Restaurantes" cambia la URL pero no navega.
- **PAEZ** (paez.com, Shopify) — cambios de temporada en el sitio (banners, rebajas, envío gratis). Contacto del cliente: Luis Gaivão.
- **MCN** — sitio con blog/"entradas" frecuentes y catálogo; hubo un bug de layout en la sección "Nosotros".
- **HDS** — chatbot + Room Directory (directorio de hotel); se actualiza mensualmente con actividades y promociones.
- **Kloster** — chatbot con promociones mensuales, menú digital, reservas, agente de reseñas y auto-respuesta a comentarios.
- **Hotel Los Robles / Punta Teonoste / Hotel Los Pasos** — chatbots ManyChat + WhatsApp con analíticas a Google Sheets. Teonoste tuvo un bug donde el bot decía "Hola" en cada mensaje.
- **Fridas, Adriatika** (Room Directory), **Mira Mira, Cacao70, Lacoste, Bloque, Jakes NY Steak, La Pista** (menús web), **Taormina** (tags/usuarios), **Vibbo Tea** (Shopify: pre-order, Kickstarter, Klaviyo), **Boquiteo, Municipalidad Pérez Zeledón** (chatbot), **APN, Ficohsa** (plantilla de broadcast en ManyChat, con límite diario de envíos), **Holdmin** (Social Media Agent), **Paseo**.

## Proyectos de producto (no son soporte de un cliente puntual)

Iniciativas más grandes vistas en Monday, para no confundirlas con clientes: **Agent Satelital** (monitoreo NDVI de cultivos, alertas), **Agent FEL** (facturas SAT en XML + formulario de proveedor → matching → ERP), **Data Agent** (ver también la sección de Spectrum), **Situa.gt** (Digital Broker: perfilado financiero, push a CRM propio + Monday), **CBC Rock the Day** (Pepsi/Gatorade/Salutaris, 8 mercados: Monday + n8n/Evolution + dashboard + Odoo).

## Módulos del RedTec Portal sin cliente/proceso documentado aparte

`Pepsi` (análisis de videos virales), `Ficohsa` (página de llamadas), `Guatecompras` (radar de activaciones OCDS + agente) — existen como organizaciones/servicios del Portal pero no hay documentación de cómo funcionan más allá del nombre del módulo.
