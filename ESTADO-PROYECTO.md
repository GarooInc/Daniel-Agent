# Estado del proyecto — Daniel Agent

Última actualización: 2026-07-28

Este archivo refleja **qué está construido ahora mismo** y **qué sigue**, para retomar el trabajo desde cualquier máquina sin perder contexto. Para el diseño completo (tareas de v1, decisiones de stack, tablero de Monday, etc.) ver `NOTAS-INICIALES.md`.

## Setup en una máquina nueva

```bash
git clone <repo>
cd Daniel-Agent
npm install
cp .env.example .env
# Llenar .env con las credenciales reales (ver sección "Credenciales" abajo)
npm run dev
```

**El `.env` nunca se sube a git** (está en `.gitignore`). Cada máquina necesita su propio `.env` con las credenciales llenadas a mano — no viajan con el repo.

## Credenciales necesarias (`.env`)

Todas ya generadas y en uso — ver `.env.example` para la plantilla. Si necesitas regenerarlas, los pasos completos (dónde conseguir cada una) están en `NOTAS-INICIALES.md`:

- `OPENROUTER_API_KEY`
- `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`
- `MONDAY_API_TOKEN`

## Estado actual (construido y verificado)

- [x] Proyecto Node.js + TypeScript inicializado (`package.json`, `tsconfig.json`)
- [x] Dependencias base instaladas: `typescript`, `tsx`, `@types/node`, `dotenv`
- [x] `src/index.ts` — placeholder que carga y valida las variables de entorno. Verificado: corre con `npm run dev` y confirma que las 5 variables requeridas están presentes.
- [ ] `@slack/bolt` — **pendiente instalar** (intento de instalación interrumpido)

## Pendientes / próximos pasos (en orden)

1. **Conectar bot de Slack (Socket Mode) con respuesta de prueba** — instalar `@slack/bolt`, crear `src/slack.ts` que arranque en Socket Mode y responda un echo simple, para confirmar que la conexión funciona antes de meterle lógica de agente.
2. **Crear base de conocimiento ficticia** — JSON con FAQs de productos RedTec y datos de cliente/cuenta de ejemplo.
3. **Configurar agente LangChain.js + OpenRouter** — cliente apuntando a OpenRouter, con tool para consultar la base de conocimiento.
4. **Agregar herramienta de escalación a Monday.com** — tool de LangChain que crea un item en el tablero (board `5101177200`) vía API GraphQL cuando el agente decide escalar.
5. **Conectar el flujo completo** — Slack recibe mensaje → agente decide resolver o escalar → responde en Slack (y crea ticket en Monday si aplica). Probar end-to-end.

## Referencia rápida del stack

Node.js + TypeScript + Express · Slack vía `@slack/bolt` (Socket Mode) · Orquestación con LangChain.js · LLM vía OpenRouter · Persistencia v1 en JSON simples · Escalación vía API GraphQL de Monday.com (board `5101177200`, no MCP).

Detalle completo de cada decisión y por qué se tomó: `NOTAS-INICIALES.md`.
