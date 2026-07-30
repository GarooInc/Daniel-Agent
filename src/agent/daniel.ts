import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { buildModel } from "./model.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { buildToolsByName } from "./tools/index.js";
import { appendMessage, getRecentMessages, type StoredMessage } from "../integrations/mongo/conversation-memory.js";
import { getCustomerProfile } from "../integrations/mongo/customer-profile.js";

const MAX_TOOL_ITERATIONS = 5;

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Extracción determinística por regex, en vez de confiar en que el modelo "recuerde"
// bien un email mencionado varios turnos atrás — el LLM demostró en pruebas en vivo que
// no siempre lo hace de forma confiable, incluso con el historial completo en contexto.
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
  const [history, profile] = await Promise.all([getRecentMessages(slackUserId), getCustomerProfile(slackUserId)]);
  await appendMessage(slackUserId, "human", userMessage);

  const mentionedEmail = profile?.email ? undefined : findMostRecentEmail(history, userMessage);
  const knownFacts: string[] = [];
  if (profile?.nombreCliente) knownFacts.push(`nombre="${profile.nombreCliente}"`);
  if (profile?.email) knownFacts.push(`email="${profile.email}"`);
  if (mentionedEmail) knownFacts.push(`email="${mentionedEmail}" (lo mencionó en esta misma conversación)`);

  const profileNote =
    knownFacts.length > 0 ? `\n\nDatos ya conocidos de este cliente — NO se los vuelvas a pedir: ${knownFacts.join(", ")}.` : "";

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(SYSTEM_PROMPT + profileNote),
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
