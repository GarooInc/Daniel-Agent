import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { buildModel } from "./model.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { buildToolsByName } from "./tools/index.js";
import { appendMessage, getLastMessageAt, getRecentMessages } from "../integrations/mongo/conversation-memory.js";
import { getCustomerProfile } from "../integrations/mongo/customer-profile.js";
import { clearTicketDraft, getTicketDraft, saveTicketDraftFields, type TicketDraftFields } from "../integrations/mongo/ticket-draft.js";
import { FIELD_LABELS, findMissingFields, mergeTicketFields } from "./tools/ticket-fields.js";
import { extractTicketFields } from "./extract-ticket-fields.js";
import { logger } from "../config/logger.js";

const MAX_TOOL_ITERATIONS = 5;

// Sin esto, el historial de chat y el borrador de ticket de un cliente nunca expiran (ver
// ESTADO-PROYECTO.md) — lo cual está bien para el perfil (nombre/email), pero para
// historial/borrador de ticket significa que una conversación vieja y no relacionada puede
// filtrarse en una charla nueva. Bug real (2026-07-30): un borrador abandonado sobre otro
// tema completó y disparó un ticket de Monday con datos que el cliente nunca dio en la
// conversación actual. Pasado este tiempo sin mensajes, se trata como sesión nueva.
const SESSION_GAP_MS = 60 * 60 * 1000;

// Se lanza cuando Daniel agota los pasos de tool-calling sin llegar a una respuesta final.
// El caller (message-handler) es quien decide qué hacer al respecto (hoy: escalar de verdad),
// en vez de que Daniel le prometa al cliente una escalación que nunca ocurre.
export class UnresolvedConversationError extends Error {
  constructor() {
    super("Daniel no pudo resolver la consulta dentro del límite de pasos permitido.");
    this.name = "UnresolvedConversationError";
  }
}

// Arma el texto que le dice al modelo qué datos del ticket ya se conocen y cuáles faltan —
// determinístico, no depende de que el modelo recuerde bien el hilo (ver ESTADO-PROYECTO.md,
// 2026-07-30: ni gpt-5-mini ni deepseek-v4-pro lo hacían de forma confiable por su cuenta).
function buildKnownDataNote(effectiveDraft: TicketDraftFields): string {
  const knownEntries = Object.entries(effectiveDraft).filter(([, value]) => value !== undefined);
  if (knownEntries.length === 0) return "";

  const missing = findMissingFields(effectiveDraft);
  const status =
    missing.length > 0
      ? `Todavía falta (si hace falta escalar): ${missing.map((f) => FIELD_LABELS[f]).join(", ")}.`
      : "Ya están todos los datos requeridos para un ticket — si corresponde escalar, llamá a escalar_a_monday ahora mismo (podés llamarla sin argumentos, ya los tiene guardados), no vuelvas a listarlos ni a pedir confirmación.";

  return `\n\nDatos ya conocidos de este cliente para un eventual ticket de soporte — NO se los vuelvas a pedir: ${knownEntries
    .map(([k, v]) => `${k}="${v}"`)
    .join(", ")}. ${status}`;
}

export async function askDaniel(userMessage: string, slackUserId: string): Promise<string> {
  const model = buildModel();
  const [lastMessageAt, historyRaw, profile, ticketDraftRaw] = await Promise.all([
    getLastMessageAt(slackUserId),
    getRecentMessages(slackUserId),
    getCustomerProfile(slackUserId),
    getTicketDraft(slackUserId),
  ]);

  const isNewSession = !lastMessageAt || Date.now() - lastMessageAt.getTime() > SESSION_GAP_MS;
  const history = isNewSession ? [] : historyRaw;
  const ticketDraft = isNewSession ? {} : ticketDraftRaw;

  // Extracción automática de datos del ticket a partir de TODA la conversación — corre en
  // cada mensaje, sin depender de que el modelo principal decida llamar a escalar_a_monday
  // con los datos correctos. En paralelo con guardar el mensaje entrante y con limpiar el
  // borrador viejo si corresponde: ninguno de los tres depende del resultado de otro.
  const [, extracted] = await Promise.all([
    appendMessage(slackUserId, "human", userMessage),
    extractTicketFields(history, userMessage),
    isNewSession
      ? clearTicketDraft(slackUserId).catch((error) => {
          logger.warn({ err: error, slackUserId }, "No se pudo limpiar el borrador de ticket viejo al iniciar sesión nueva");
        })
      : Promise.resolve(),
  ]);

  const effectiveDraft = mergeTicketFields(extracted, ticketDraft, profile ?? {});
  await saveTicketDraftFields(slackUserId, effectiveDraft);

  const toolsByName = buildToolsByName(slackUserId, effectiveDraft);
  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(SYSTEM_PROMPT + buildKnownDataNote(effectiveDraft)),
    ...history.map((m) => (m.role === "human" ? new HumanMessage(m.content) : new AIMessage(m.content))),
    new HumanMessage(userMessage),
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await model.invoke(messages);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      const respuesta = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      await appendMessage(slackUserId, "ai", respuesta);
      return respuesta;
    }

    for (const call of response.tool_calls) {
      const selected = toolsByName[call.name];
      const result = selected ? await selected.invoke(call.args) : `Herramienta desconocida: ${call.name}`;
      messages.push(new ToolMessage({ content: String(result), tool_call_id: call.id ?? "" }));
    }
  }

  throw new UnresolvedConversationError();
}
