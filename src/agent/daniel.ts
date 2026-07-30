import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { buildModel } from "./model.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { buildToolsByName } from "./tools/index.js";
import { appendMessage, getRecentMessages, type StoredMessage } from "../integrations/mongo/conversation-memory.js";
import { getCustomerProfile } from "../integrations/mongo/customer-profile.js";
import { getTicketDraft, saveTicketDraftFields, type TicketDraftFields } from "../integrations/mongo/ticket-draft.js";
import { FIELD_LABELS, findMissingFields } from "./tools/ticket-fields.js";
import { extractTicketFields } from "./extract-ticket-fields.js";

const MAX_TOOL_ITERATIONS = 5;

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Respaldo barato y determinístico además de la extracción por LLM de abajo.
function findMostRecentEmail(history: StoredMessage[], currentMessage: string): string | undefined {
  const candidates = [...history.filter((m) => m.role === "human").map((m) => m.content), currentMessage];
  for (let i = candidates.length - 1; i >= 0; i--) {
    const matches = candidates[i].match(EMAIL_REGEX);
    if (matches) return matches[matches.length - 1];
  }
  return undefined;
}

// Se lanza cuando Daniel agota los pasos de tool-calling sin llegar a una respuesta final.
// El caller (message-handler) es quien decide qué hacer al respecto (hoy: escalar de verdad),
// en vez de que Daniel le prometa al cliente una escalación que nunca ocurre.
export class UnresolvedConversationError extends Error {
  constructor() {
    super("Daniel no pudo resolver la consulta dentro del límite de pasos permitido.");
    this.name = "UnresolvedConversationError";
  }
}

export async function askDaniel(userMessage: string, slackUserId: string): Promise<string> {
  const model = buildModel();
  const toolsByName = buildToolsByName(slackUserId);
  const [history, profile, ticketDraft] = await Promise.all([
    getRecentMessages(slackUserId),
    getCustomerProfile(slackUserId),
    getTicketDraft(slackUserId),
  ]);
  await appendMessage(slackUserId, "human", userMessage);

  // Extracción automática de datos del ticket a partir de TODA la conversación — corre en
  // cada mensaje, sin depender de que el modelo principal decida llamar a escalar_a_monday
  // con los datos correctos (en pruebas en vivo, ni gpt-5-mini ni deepseek-v4-pro lo hacían
  // con la disciplina esperada). Esto persiste el borrador actualizado ANTES de generar la
  // respuesta, así escalar_a_monday puede completarse aunque el modelo la llame sin argumentos.
  const extracted = await extractTicketFields(history, userMessage);
  const mentionedEmail = findMostRecentEmail(history, userMessage);

  const effectiveDraft: TicketDraftFields = {
    nombreCliente: extracted.nombreCliente ?? ticketDraft.nombreCliente ?? profile?.nombreCliente,
    email: extracted.email ?? ticketDraft.email ?? mentionedEmail ?? profile?.email,
    resumen: extracted.resumen ?? ticketDraft.resumen,
    urgencia: extracted.urgencia ?? ticketDraft.urgencia,
    tipoSolicitud: extracted.tipoSolicitud ?? ticketDraft.tipoSolicitud,
    producto: extracted.producto ?? ticketDraft.producto,
    queSeIntentoYa: extracted.queSeIntentoYa ?? ticketDraft.queSeIntentoYa,
  };
  await saveTicketDraftFields(slackUserId, effectiveDraft);

  const knownEntries = Object.entries(effectiveDraft).filter(([, value]) => value !== undefined);
  const missing = findMissingFields(effectiveDraft);

  const knownDataNote =
    knownEntries.length > 0
      ? `\n\nDatos ya conocidos de este cliente para un eventual ticket de soporte — NO se los vuelvas a pedir: ${knownEntries
          .map(([k, v]) => `${k}="${v}"`)
          .join(", ")}. ${
          missing.length > 0
            ? `Todavía falta (si hace falta escalar): ${missing.map((f) => FIELD_LABELS[f]).join(", ")}.`
            : "Ya están todos los datos requeridos para un ticket — si corresponde escalar, llamá a escalar_a_monday ahora mismo (podés llamarla sin argumentos, ya los tiene guardados), no vuelvas a listarlos ni a pedir confirmación."
        }`
      : "";

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(SYSTEM_PROMPT + knownDataNote),
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
