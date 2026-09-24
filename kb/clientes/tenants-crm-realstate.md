# Tenants de CRM Realstate — notas internas sin cliente propio para sembrar

> **Visibilidad: Interno (archivo completo).** Nunca cargar como `client_wiki` de ningún cliente —
> no son datos de soporte de un cliente externo. Ver `kb/politica-acceso-y-visibilidad.md`.
>
> **2026-09-24**: los 8 tenants con cliente externo real que vivían en este archivo se separaron
> en su propia página cada uno (`grupo-althura.md`, `constructora-rosero.md`,
> `reynoso-bienes-raices.md`, `grupo-cofino.md`, `grupo-paz.md`, `grupo-syg.md`, `axis.md`) — ver
> `kb/gaps-y-decisiones.md`. Quedan acá solo los dos casos que **no** son un cliente de soporte a
> sembrar.

## RedTec.ai (tenant interno) — `redtecai`, prefijo `redte_`

Tenant de demos y ventas de la propia plataforma RedTec — no es un cliente externo, es la propia
empresa. Isabella vende "AI Employees" (también por voz, ElevenLabs); Walter hace el intake de
demos y pasa a Taylor, que las arma (`provisionTenant`); Sofi/Sophie llevan lo social/LinkedIn;
Dante audita. Stripe está en modo TEST. Sincroniza a **GoHighLevel**. KB con 84 entradas. Regla:
solo debe hablar de los agentes del roster oficial y no navega redtec.ai en vivo (responde solo
desde su KB). Owner: Hugo Arias.

Confirmado en vivo (2026-09-22): 257 contactos, modelo `anthropic/claude-sonnet-5`, 70 mensajes ese
día, llamadas salientes activadas (ON) — el único tenant con **7 agentes** en vez de 6 (incluye a
Dante activo), 5/7 activos.

## Archgroup y Hoteles — ya no existen como tenants

Según el PDF de Monday de septiembre existían como tenants vacíos ("shells", ids 11 y 12).
Confirmado en vivo (2026-09-22): ninguno de los dos aparece ya en la lista de 12 tenants reales —
Archgroup parece haberse disuelto (sus usuarios, con dominio `archg.net`, quedaron reasignados al
tenant "Redtec AI"); "Hoteles" tampoco existe como tenant, aunque sí hay una solicitud de demo
activada a nombre de "Hoteles" el 2026-09-03 en la sección Pagos — no llegó a convertirse en un
tenant real, y **no tiene relación con Hoteles Belize** (el cliente real de Itz'ana/Ka'ana, que
opera aparte con un agente en n8n, ver `kb/clientes/hoteles-belize.md`).
