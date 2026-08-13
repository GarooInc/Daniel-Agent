/**
 * TEST END-TO-END — Daniel Agent
 *
 * Qué prueba:
 *   - Flujo completo de conversación multi-turno (datos dados de a uno)
 *   - Memoria entre turnos (in-memory store en vez de MongoDB real)
 *   - Extracción automática de campos con LLM real (OpenRouter)
 *   - Escalación a Monday.com con datos correctos
 *   - Limpieza del estado tras crear el ticket
 *   - Cleanup automático del ticket de prueba en Monday
 *
 * Qué NO prueba (requeriría MONGODB_URI de producción):
 *   - Conectividad real de MongoDB Atlas en producción
 *
 * Cómo correr: npx tsx src/test-e2e.ts
 */
import "dotenv/config";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { buildModel } from "./agent/model.js";
import { SYSTEM_PROMPT } from "./agent/prompt.js";
import { extractTicketFields } from "./agent/extract-ticket-fields.js";
import { FIELD_LABELS, findMissingFields, mergeTicketFields } from "./agent/tools/ticket-fields.js";
import { searchFaqsTool } from "./agent/tools/search-faqs.js";
import { getAllCustomers } from "./knowledge-base/index.js";
import { createSupportTicket, URGENCIA_VALUES, TIPO_SOLICITUD_VALUES, PRODUCTO_VALUES } from "./integrations/monday/create-ticket.js";
import { notifyEscalation } from "./integrations/slack/notify-escalation.js";
import { mondayRequest } from "./integrations/monday/client.js";
import type { TicketDraftFields } from "./integrations/mongo/ticket-draft.js";
import type { StoredMessage } from "./integrations/mongo/conversation-memory.js";

// ─── Colores para la consola ──────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m",
  cyan: "\x1b[36m", gray: "\x1b[90m", blue: "\x1b[34m",
};
const ok  = (s: string) => `${C.green}✅ ${s}${C.reset}`;
const err = (s: string) => `${C.red}❌ ${s}${C.reset}`;
const warn = (s: string) => `${C.yellow}⚠️  ${s}${C.reset}`;
const info = (s: string) => `${C.cyan}ℹ️  ${s}${C.reset}`;

// ─── In-memory store (reemplaza MongoDB para el test) ──────────────────────────
interface ChatEntry { role: "human" | "ai"; content: string; createdAt: Date }
interface ChatDoc   { messages: ChatEntry[]; updatedAt: Date }

const chatHistories = new Map<string, ChatDoc>();
const ticketDrafts  = new Map<string, TicketDraftFields>();
const userProfiles  = new Map<string, { nombreCliente?: string; email?: string }>();

const STORED_MESSAGES_CAP = 100;
const HISTORY_LIMIT        = 15;
const SESSION_GAP_MS       = 60 * 60 * 1000;

const store = {
  getRecentMessages(uid: string, limit = HISTORY_LIMIT): StoredMessage[] {
    return (chatHistories.get(uid)?.messages ?? [])
      .slice(-limit)
      .map(({ role, content }) => ({ role, content }));
  },
  getLastMessageAt(uid: string): Date | undefined {
    const msgs = chatHistories.get(uid)?.messages ?? [];
    return msgs[msgs.length - 1]?.createdAt;
  },
  appendMessage(uid: string, role: "human" | "ai", content: string): void {
    const doc = chatHistories.get(uid) ?? { messages: [], updatedAt: new Date() };
    doc.messages = [...doc.messages, { role, content, createdAt: new Date() }].slice(-STORED_MESSAGES_CAP);
    doc.updatedAt = new Date();
    chatHistories.set(uid, doc);
  },
  clearHistory(uid: string): void  { chatHistories.delete(uid); },
  getTicketDraft(uid: string): TicketDraftFields { return ticketDrafts.get(uid) ?? {}; },
  saveTicketDraft(uid: string, fields: TicketDraftFields): void {
    const existing = ticketDrafts.get(uid) ?? {};
    const merged: TicketDraftFields = {};
    for (const [k, v] of Object.entries({ ...existing, ...fields })) {
      if (v !== undefined) (merged as Record<string, unknown>)[k] = v;
    }
    ticketDrafts.set(uid, merged);
  },
  clearTicketDraft(uid: string): void { ticketDrafts.delete(uid); },
  getProfile(uid: string) { return userProfiles.get(uid) ?? null; },
  saveProfile(uid: string, p: { nombreCliente?: string; email?: string }): void {
    userProfiles.set(uid, { ...(userProfiles.get(uid) ?? {}), ...p });
  },
};

// ─── Nota de datos conocidos (igual que daniel.ts) ────────────────────────────
function buildKnownDataNote(draft: TicketDraftFields): string {
  const known = Object.entries(draft).filter(([, v]) => v !== undefined);
  if (known.length === 0) return "";
  const missing = findMissingFields(draft);
  const status = missing.length > 0
    ? `Todavía falta (si hace falta escalar): ${missing.map((f) => FIELD_LABELS[f]).join(", ")}.`
    : "Ya están todos los datos requeridos para un ticket — si corresponde escalar, llamá a escalar_a_monday ahora mismo (podés llamarla sin argumentos, ya los tiene guardados), no vuelvas a listarlos ni a pedir confirmación.";
  return `\n\nDatos ya conocidos de este cliente para un eventual ticket de soporte — NO se los vuelvas a pedir: ${known.map(([k, v]) => `${k}="${v}"`).join(", ")}. ${status}`;
}

// ─── Tool buscar_cliente sobre customers.json (en vez de la colección Mongo real que usa
// lookup-customer.ts en producción) — mismo motivo que el resto de los stores de este archivo:
// este test no requiere MONGODB_URI de producción (ver docstring del archivo).
const localLookupCustomerTool = tool(
  async ({ email }) => {
    const e = email.toLowerCase();
    const customer = getAllCustomers().find((c) => c.email.toLowerCase() === e);
    if (!customer) return "No se encontró ningún cliente con ese email.";
    return JSON.stringify(customer, null, 2);
  },
  {
    name: "buscar_cliente",
    description: "Busca el estado de una cuenta de cliente por su email.",
    schema: z.object({ email: z.string().describe("Email del cliente") }),
  },
);

// ─── Tool escalar_a_monday con in-memory store ────────────────────────────────
let lastCreatedTicketId: string | undefined;

function buildEscalarTool(uid: string, effectiveDraft: TicketDraftFields, onTicketCreated?: () => void) {
  return tool(
    async (args) => {
      const merged = mergeTicketFields(args, effectiveDraft);
      const missing = findMissingFields(merged);

      if (missing.length > 0) {
        store.saveTicketDraft(uid, merged);
        return `Guardé estos datos del ticket. Todavía falta: ${missing.map((f) => FIELD_LABELS[f]).join(", ")}. Pedíselo al cliente.`;
      }

      const ticket = {
        nombreCliente: merged.nombreCliente!,
        email: merged.email!,
        resumen: merged.resumen!,
        urgencia: merged.urgencia!,
        tipoSolicitud: merged.tipoSolicitud!,
        producto: merged.producto!,
        queSeIntentoYa: merged.queSeIntentoYa || "No especificado",
        canalOrigen: "slack" as const,
      };

      const ticketId = await createSupportTicket(ticket);
      lastCreatedTicketId = ticketId;

      notifyEscalation({ ticketId, ...ticket }).catch(() => {});

      store.saveProfile(uid, { nombreCliente: ticket.nombreCliente, email: ticket.email });
      store.clearTicketDraft(uid);
      if (onTicketCreated) {
        onTicketCreated();
      } else {
        store.clearHistory(uid);
      }

      return `Ticket creado en Monday.com con id ${ticketId}.`;
    },
    {
      name: "escalar_a_monday",
      description:
        "Crea un ticket de soporte en Monday.com cuando Daniel no puede resolver la consulta del cliente directamente. Se puede llamar con datos parciales o incluso SIN argumentos — la herramienta ya tiene guardados los datos que se detectaron en la conversación y te dice qué falta si algo no está. Cuando ya tenga todos los campos requeridos, crea el ticket de verdad de inmediato.",
      schema: z.object({
        nombreCliente: z.string().optional().describe("Nombre del cliente, si ya lo dio"),
        email: z.string().optional().describe("Email del cliente, si ya lo dio"),
        resumen: z.string().optional().describe("Resumen breve del problema o consulta"),
        urgencia: z.enum(URGENCIA_VALUES).optional(),
        tipoSolicitud: z.enum(TIPO_SOLICITUD_VALUES).optional(),
        producto: z.enum(PRODUCTO_VALUES).optional(),
        queSeIntentoYa: z.string().optional(),
      }),
    },
  );
}

// ─── Loop de conversación (igual que daniel.ts, con in-memory store) ───────────
const MAX_TOOL_ITERATIONS = 5;

async function askDanielE2E(userMessage: string, uid: string): Promise<string> {
  const lastAt = store.getLastMessageAt(uid);
  const isNewSession = !lastAt || Date.now() - lastAt.getTime() > SESSION_GAP_MS;
  const history   = isNewSession ? [] : store.getRecentMessages(uid);
  const draftPrev = isNewSession ? {} : store.getTicketDraft(uid);
  const profile   = store.getProfile(uid);

  if (isNewSession) store.clearTicketDraft(uid);

  store.appendMessage(uid, "human", userMessage);
  const extracted = await extractTicketFields(history, userMessage);

  const effectiveDraft = mergeTicketFields(extracted, draftPrev, profile ?? {});
  store.saveTicketDraft(uid, effectiveDraft);

  let ticketCreated = false;
  const toolsByName: Record<string, any> = {
    buscar_faqs: searchFaqsTool,
    buscar_cliente: localLookupCustomerTool,
    escalar_a_monday: buildEscalarTool(uid, effectiveDraft, () => {
      ticketCreated = true;
    }),
  };
  const model = buildModel(Object.values(toolsByName));

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(SYSTEM_PROMPT + buildKnownDataNote(effectiveDraft)),
    ...history.map((m) => (m.role === "human" ? new HumanMessage(m.content) : new AIMessage(m.content))),
    new HumanMessage(userMessage),
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await model.invoke(messages);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      store.appendMessage(uid, "ai", text);
      if (ticketCreated) {
        store.clearHistory(uid);
      }
      return text;
    }

    for (const call of response.tool_calls) {
      const selected = toolsByName[call.name];
      const result = selected
        ? await selected.invoke(call.args)
        : `Herramienta desconocida: ${call.name}`;
      messages.push(new ToolMessage({ content: String(result), tool_call_id: call.id ?? "" }));
    }
  }

  return "ERROR: Agotó las iteraciones de tool-calling sin respuesta final.";
}

// ─── Eliminar ticket de Monday (cleanup) ─────────────────────────────────────
async function deleteMonday(itemId: string): Promise<void> {
  const mutation = `mutation { delete_item(item_id: ${itemId}) { id } }`;
  await mondayRequest(mutation, {});
}

// ─── Assertions ───────────────────────────────────────────────────────────────
interface Check { label: string; passed: boolean; detail?: string }
const checks: Check[] = [];

function assert(label: string, condition: boolean, detail?: string) {
  checks.push({ label, passed: condition, detail });
  console.log(condition ? ok(label) : err(label) + (detail ? `\n   ${C.gray}${detail}${C.reset}` : ""));
}

// ─── El test ──────────────────────────────────────────────────────────────────
const TEST_UID = "E2E_TEST_USER_DANIEL_001";

const TURNS = [
  { msg: "no puedo iniciar sesión en Sofi",   label: "Turno 1 — problema inicial" },
  { msg: "soy Jorge Test",                     label: "Turno 2 — nombre" },
  { msg: "mi correo es jorge-test@redtec.ai",  label: "Turno 3 — email" },
  { msg: "quiero hablar con alguien del equipo ya, por favor", label: "Turno 4 — escalación explícita" },
  { msg: "sí, escalá",                         label: "Turno 5 — confirmación" },
];

console.log(`\n${C.bold}${"═".repeat(64)}${C.reset}`);
console.log(`${C.bold}  🧪 TEST E2E — Daniel Agent   ${new Date().toLocaleTimeString()}${C.reset}`);
console.log(`${C.bold}${"═".repeat(64)}${C.reset}\n`);

const turnResults: { turn: number; msg: string; response: string }[] = [];

for (let i = 0; i < TURNS.length; i++) {
  const { msg, label } = TURNS[i];
  console.log(`\n${C.blue}${C.bold}${label}${C.reset}`);
  console.log(`${C.gray}  👤 Jorge: ${msg}${C.reset}`);

  const draftBefore = { ...store.getTicketDraft(TEST_UID) };
  const histBefore  = store.getRecentMessages(TEST_UID).length;

  let response: string;
  try {
    response = await askDanielE2E(msg, TEST_UID);
  } catch (e) {
    response = `ERROR: ${e}`;
    console.log(err(`askDaniel lanzó error: ${e}`));
  }

  const draftAfter = { ...store.getTicketDraft(TEST_UID) };
  const histAfter  = store.getRecentMessages(TEST_UID).length;

  console.log(`${C.cyan}  🤖 Daniel: ${response.substring(0, 250)}${response.length > 250 ? "..." : ""}${C.reset}`);
  console.log(`${C.gray}  Draft: ${JSON.stringify(draftAfter)}${C.reset}`);
  console.log(`${C.gray}  Historia: ${histBefore} → ${histAfter} msgs${C.reset}`);

  turnResults.push({ turn: i + 1, msg, response });

  // Si ya se creó el ticket, no seguir con más turnos
  if (lastCreatedTicketId) {
    console.log(info(`Ticket creado en Turno ${i + 1} — fin del flujo`));
    break;
  }
}

// ─── Validaciones post-conversación ───────────────────────────────────────────
console.log(`\n${C.bold}${"─".repeat(64)}${C.reset}`);
console.log(`${C.bold}  📊 Validaciones${C.reset}`);
console.log(`${C.bold}${"─".repeat(64)}${C.reset}\n`);

// 1. Se creó un ticket en Monday
assert(
  "Ticket creado en Monday.com",
  !!lastCreatedTicketId,
  lastCreatedTicketId ? `ID: ${lastCreatedTicketId}` : "No se encontró ticket ID en ninguna respuesta",
);

// 2. El historial se limpió tras crear el ticket (fix f06c626)
const histFinal = store.getRecentMessages(TEST_UID).length;
assert(
  "Historial limpiado tras escalación (fix f06c626)",
  histFinal === 0,
  `Mensajes restantes: ${histFinal}`,
);

// 3. El borrador se limpió
const draftFinal = store.getTicketDraft(TEST_UID);
assert(
  "Borrador de ticket limpiado tras escalación",
  Object.keys(draftFinal).length === 0,
  `Borrador restante: ${JSON.stringify(draftFinal)}`,
);

// 4. Perfil del cliente guardado
const profileFinal = store.getProfile(TEST_UID);
assert(
  "Perfil del cliente guardado (nombre + email)",
  !!profileFinal?.nombreCliente && !!profileFinal?.email,
  `Perfil: ${JSON.stringify(profileFinal)}`,
);

// 5. Daniel no repreguntó el nombre después del Turno 2
const turn3Response = turnResults.find((t) => t.turn === 3)?.response ?? "";
const askNameAgain = /cómo te llamás|cuál es tu nombre|nombre completo/i.test(turn3Response);
assert(
  "Daniel no volvió a pedir el nombre en Turno 3",
  !askNameAgain,
  `Respuesta Turno 3: "${turn3Response.substring(0, 100)}"`,
);

// 6. Daniel no dijo "no apareció como cliente registrado" como bloqueante
const allResponses = turnResults.map((t) => t.response).join(" ");
const blockedByLookup = /no aparece.*cliente|no te encontré.*cliente|no estás registrado/i.test(allResponses);
assert(
  "Daniel no bloqueó la escalación por falta de cliente en BD",
  !blockedByLookup,
  blockedByLookup ? "Encontré mensaje de bloqueo por lookup fallido" : undefined,
);

// ─── Verificar datos del ticket en Monday ─────────────────────────────────────
if (lastCreatedTicketId) {
  console.log(`\n${C.bold}${"─".repeat(64)}${C.reset}`);
  console.log(`${C.bold}  🎫 Verificando ticket #${lastCreatedTicketId} en Monday${C.reset}`);
  console.log(`${C.bold}${"─".repeat(64)}${C.reset}\n`);

  try {
    type ItemResponse = {
      items: { id: string; name: string; column_values: { id: string; text: string }[] }[];
    };
    const data = await mondayRequest<ItemResponse>(
      `query { items(ids: [${lastCreatedTicketId}]) { id name column_values { id text } } }`,
      {},
    );

    const item = data.items?.[0];
    if (item) {
      const colMap = Object.fromEntries(item.column_values.map((c) => [c.id, c.text]));
      const productoEnTicket   = colMap["color_mm5qwh54"] ?? "(vacío)";
      const resumenEnTicket    = colMap["text1"] ?? "(vacío)";
      const emailEnTicket      = colMap["text"] ?? "(vacío)";

      console.log(`${C.gray}  Nombre:   ${item.name}${C.reset}`);
      console.log(`${C.gray}  Email:    ${emailEnTicket}${C.reset}`);
      console.log(`${C.gray}  Resumen:  ${resumenEnTicket}${C.reset}`);
      console.log(`${C.gray}  Producto: ${productoEnTicket}${C.reset}`);
      console.log();

      assert(
        "Producto en ticket es 'Sofi' (no 'Otro')",
        productoEnTicket.toLowerCase().includes("sofi"),
        `Producto recibido: "${productoEnTicket}"`,
      );
      assert(
        "Email en ticket coincide con el dado en la conversación",
        emailEnTicket.includes("jorge-test@redtec.ai"),
        `Email recibido: "${emailEnTicket}"`,
      );
      assert(
        "Resumen no es el texto crudo del último mensaje",
        !resumenEnTicket.includes("jorge-test@redtec.ai") && resumenEnTicket.length > 10,
        `Resumen recibido: "${resumenEnTicket}"`,
      );
    }
  } catch (e) {
    console.log(warn(`No se pudo verificar el ticket en Monday: ${e}`));
  }

  // ─── Cleanup Monday ───────────────────────────────────────────────────────
  console.log(`\n${C.bold}${"─".repeat(64)}${C.reset}`);
  console.log(`${C.bold}  🧹 Limpiando ticket de prueba en Monday${C.reset}`);
  console.log(`${C.bold}${"─".repeat(64)}${C.reset}\n`);

  try {
    await deleteMonday(lastCreatedTicketId);
    console.log(ok(`Ticket #${lastCreatedTicketId} eliminado de Monday`));
  } catch (e) {
    console.log(warn(`No se pudo eliminar el ticket ${lastCreatedTicketId}: ${e}\n  → Borrarlo manualmente en redtechai.monday.com`));
  }
}

// ─── Resumen final ────────────────────────────────────────────────────────────
console.log(`\n${C.bold}${"═".repeat(64)}${C.reset}`);
console.log(`${C.bold}  📋 RESUMEN${C.reset}`);
console.log(`${C.bold}${"═".repeat(64)}${C.reset}\n`);

const passed = checks.filter((c) => c.passed).length;
const total  = checks.length;

for (const c of checks) {
  console.log(c.passed ? ok(c.label) : err(c.label + (c.detail ? ` → ${c.detail}` : "")));
}

console.log(`\n${passed === total ? C.green : C.red}${C.bold}  ${passed}/${total} checks pasaron${C.reset}`);
if (passed < total) {
  console.log(`\n${C.yellow}  Próximos pasos:${C.reset}`);
  for (const c of checks.filter((ch) => !ch.passed)) {
    console.log(`  - ${C.bold}${c.label}${C.reset}${c.detail ? `: ${c.detail}` : ""}`);
  }
}
console.log(`\n${C.bold}${"═".repeat(64)}${C.reset}\n`);
