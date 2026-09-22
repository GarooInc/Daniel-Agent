# Gaps, decisiones pendientes y hallazgos — compilación de KB para Daniel (2026-09-22)

> **Visibilidad: Interno (archivo completo).** Documento de planeación para el equipo de RedTec — nunca debe llegar a un canal de cliente. Ver `kb/politica-acceso-y-visibilidad.md`.
>
> Compilado a partir de: Monday (solo lectura), los repos locales de Garoo (solo lectura), y una **sesión en vivo como superadmin en crm.redtec.ai el 2026-09-22** (actualizado tras esa sesión). Nada de esto se cargó todavía a Postgres — son archivos markdown en `kb/` para revisar antes de sembrar `documents`/`client_wiki`.

## ⚠️ Hallazgo de seguridad — no relacionado con la KB, pero urgente

El documento de Monday **"Itzana - Backend"** (doc `6372982`, objeto `5086981869`) tiene, en texto plano, una **clave privada RSA completa y la IP del servidor backend**, visible para todo el workspace de Monday (11 miembros). También existen documentos titulados "DB Credentials" y "Credenciales Netsuite" que no se abrieron. **Recomendación: rotar esa clave y esas credenciales, y moverlas a un gestor de secretos**, independientemente de esta tarea de KB.

## Decisiones que necesitan que Jorge las tome antes de sembrar la base de datos

1. **Nombres canónicos de `empresa` para los clientes nuevos.** El Injerto, El Convento, Wyndham Guatemala, Hoteles Belize, Desarrollos CAP y **OKÜN Living (Grupo VEQ)** (descubierto en vivo el 2026-09-22, no existía en ningún otro sistema) no existen todavía en `whatsapp_groups`/`tech_agents`/`monday_clientes` de Daniel. Los nombres usados en `kb/clientes/*.md` son propuestas, no están confirmados.
2. **Hoteles Belize: ¿una `empresa` o dos?** Itz'ana y Ka'ana comparten cuenta ManyChat, workflows y KB (solo se distinguen por el campo `propiedad`). Recomendación de esta compilación: una sola `empresa` = "Hoteles Belize", con secciones internas por propiedad.
3. **Relación Bravante ↔ Mundo Verde.** `whatsapp_groups` los tiene como clientes separados, pero la evidencia (Odoo compartido, prefijos de orden de compra `OC-BRA`) sugiere que Bravante es una compañía dentro del mismo grupo/Odoo de Mundo Verde. Hay que confirmarlo con el cliente o con Fernando Ortiz antes de fusionar o separar sus páginas de `client_wiki`.
4. **Cómo va a leer Daniel el `client_wiki`.** Sigue sin decidirse si es una tool que el modelo elige llamar o una inyección automática en el prompt cuando se conoce la `empresa` (ver `plans/2026-09-07-client-wiki.md`). **Sembrar estas páginas no tiene ningún efecto en las respuestas de Daniel hasta que se resuelva esto.**
5. **Reemplazo de `faqs.json`.** Las FAQs actuales son ficticias y contradicen la plataforma real (ver `kb/faqs-candidatas.md`). Recomendación: reemplazarlas, no fusionarlas con las nuevas.
6. **Política de acceso y visibilidad (qué puede ver cada canal/cliente).** Propuesta completa en `kb/politica-acceso-y-visibilidad.md` (taxonomía Público/Cliente/Interno/Secreto, filtrado por `empresa`/canal en la query, nunca en el prompt). Confirmada por Jorge el 2026-09-22 ("ok avancemos") — **✅ retagging aplicado** a los 10 archivos de `kb/clientes/*.md`, `kb/plataforma/redtec.md` y `kb/faqs-candidatas.md` (columna `visibilidad` en la tabla de FAQs, marcas **[INTERNO]** inline en las páginas de cliente). **Pendiente todavía** (bloqueante para sembrar la base de datos): (a) `kb/clientes/tenants-crm-realstate.md` y `kb/clientes/rnr-y-otros.md` mezclan varios `empresa` distintos en un solo archivo — hay que partirlos en una página por cliente antes de cargar `client_wiki`, nunca cargar esos archivos completos bajo una sola empresa; (b) implementar el mecanismo técnico real (columna `visibility` + filtro obligatorio en la query, ver política) — hoy el marcado es solo textual/manual.

## `monday_clientes` — mapeos nuevos propuestos

La columna "Cliente" de Monday (`text_mm5s75rw`) usa texto libre e inconsistente. Antes de que Daniel pueda avisar por WhatsApp a estos clientes cuando cambie el estado de un ticket, hace falta un `INSERT` en `monday_clientes` por cada variante de texto vista:

| Texto visto en Monday | `empresa` propuesta |
|---|---|
| "Rosero Construye" | `Constructora Rosero` |
| "Bravante (Mundo Verde)" / "Mundo Verde / Bravante" | `Mundo Verde` (pendiente de la decisión #3 de arriba) |
| "Grupo Althura" / "Althura" | `Grupo Althura` |
| "El Injerto (Garu)" | `El Injerto` |
| "redtecai" (pedidos internos de Fernando sobre otros clientes) | no mapear — es un valor interno, no un cliente real |

## Gaps de información — dónde falta profundizar

1. **Fichas de tenant no leídas en Monday.** El board `5103725883` tiene, por cada tenant de CRM Realstate, fichas PDF de Persona/Knowledge/Tools/Flujo/Esquema/Seguridad/Calidad/Go-live — solo se leyeron las de "Identidad" de Althura, Rosero, Spectrum y RedTec.ai. Probablemente tienen el detalle más útil para completar `client_wiki` de esos tenants.
2. **~110 tickets viejos de "Soporte y Emergencias"** (anteriores a agosto 2026) solo tienen título, sin descripción ni cliente asignado. No se leyeron los comentarios ("updates") de ningún ticket — ahí probablemente están las resoluciones concretas de los que figuran "Done".
3. **✅ Resuelto en gran parte (2026-09-22)**: se hizo login real como superadmin y se recorrió la Sala de control completa (los 12 tenants, Agente de soporte/Rita, Grupos de WhatsApp, Campañas Meta, MCP Superadmin, Pagos, Usuarios/roles) — ver `kb/plataforma/redtec.md`, sección "crm.redtec.ai — estructura del panel". **Sigue faltando**: la vista de administrador de un tenant específico ("Entrar como admin" — Dashboard, CRM/Pipeline, Live Chat, Agenda, Cotizaciones, Knowledge Base del lado del cliente) no se abrió en esta pasada por no ser necesaria para el objetivo de esta sesión; las filas 🔲 de `kb/faqs-candidatas.md` que dependen de esa vista siguen sin confirmar. `Agent-CAP/docs/STATUS.md` tiene una auditoría de esa vista específica para Desarrollos CAP del 2026-09-21.
4. **Sin documentación de sistema más allá de lo confirmado en vivo (modelo/contactos/agentes activos)**: Cofiño, Grupo Paz, Grupo SyG, Reynoso, Axis, OKÜN Living (Grupo VEQ). RNR (qué automatización opera RedTec para ellos, si alguna, más allá de los módulos del Portal), Pepsi, Ficohsa y Guatecompras (solo aparecen como nombres de módulo del Portal, sin detalle de cómo funcionan).
5. **Sofi/Sophie (community manager) y el widget-chatbot genérico**: no hay ningún repo o ficha que documente cómo funcionan en la práctica — todo lo que hay es el nombre en un roster.
6. **Planes y precios de redtec.ai**: nada documentado más allá de "hay una demo de 15 días" y que Desarrollos CAP está en plan "demo, sin Stripe".
7. **Matriz de contactos de escalamiento por rol del lado RedTec**: los repos nombran personas sueltas, pero no existe una tabla oficial de "quién es el owner de cada cliente". El runbook de Telnyx directamente dice que sus owners están "pendientes de nombrar".
8. **Agent-ADS** (Meta Ads AI Media Buyer) es solo planificación — nada construido todavía, no es material de soporte.

## Datos con fecha de vencimiento (revisar antes de dar por vigentes)

- Spectrum, incidente **#42** (el CRM no persiste `_FechaCita`/`_TipoCita`) y **#49** (servidor del CRM del cliente caído, 2026-09-22) y **#50** (causa de fondo de leads viejos pisando campañas) — confirmar si siguen abiertos antes de repetirlos como estado actual.
- Bravante, fecha de entrega: el PDF de KB de Monday (2026-09-08) dice "~2027"; los tickets de agosto 2026 dicen "mayo 2028" — se usó 2028 en `kb/clientes/mundo-verde.md` por ser la fuente más reciente, pero conviene confirmarlo con el cliente.
- Desarrollos CAP: "Hacienda Las Margaritas sin ficha" y "seguimiento manual por el mismo número de WhatsApp de Isabella" son estado al 2026-09-22 — revisar si ya se resolvieron.
