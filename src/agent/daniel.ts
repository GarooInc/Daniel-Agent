import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { buildModel } from "./model.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { toolsByName } from "./tools/index.js";

const MAX_TOOL_ITERATIONS = 5;

export async function askDaniel(userMessage: string): Promise<string> {
  const model = buildModel();
  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(userMessage),
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await model.invoke(messages);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      return typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    }

    for (const call of response.tool_calls) {
      const selected = toolsByName[call.name];
      const result = selected ? await selected.invoke(call.args) : `Herramienta desconocida: ${call.name}`;
      messages.push(new ToolMessage({ content: String(result), tool_call_id: call.id ?? "" }));
    }
  }

  return "No pude resolver la consulta, voy a escalarla a soporte.";
}
