import { ChatOpenAI } from "@langchain/openai";
import { env } from "../config/env.js";
import { tools } from "./tools/index.js";

export function buildModel() {
  return new ChatOpenAI({
    model: env.openRouterModel,
    apiKey: env.openRouterApiKey,
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
  }).bindTools(tools);
}
