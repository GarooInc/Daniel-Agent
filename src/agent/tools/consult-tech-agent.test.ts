import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TechAgentConfig } from "../../config/tech-agents.js";

const createHandoff = vi.fn().mockResolvedValue(undefined);
const resolveChannelId = vi.fn();

vi.mock("../../integrations/mongo/tech-agent-handoff.js", () => ({ createHandoff }));
vi.mock("../../integrations/slack/resolve-channel.js", () => ({ resolveChannelId }));

const { createConsultTechAgentTool } = await import("./consult-tech-agent.js");

function fakeClient(postMessageResult: { ts: string } = { ts: "1699999999.000100" }) {
  return {
    chat: { postMessage: vi.fn().mockResolvedValue(postMessageResult) },
  } as any;
}

const FAKE_CONFIG: TechAgentConfig = {
  empresa: "Spectrum",
  slackChannel: "tecnico-spectrum",
  slackBotUserId: "U_TECH_AGENT",
};

describe("consultar_agente_tecnico tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posta en el canal privado del cliente y guarda el handoff cuando todo está configurado", async () => {
    resolveChannelId.mockResolvedValue("C_AGENTES");
    const client = fakeClient({ ts: "1699999999.000100" });
    const tool = createConsultTechAgentTool(client, "U_CLIENTE", "C_CLIENTE_DM", FAKE_CONFIG);

    const result = await tool.invoke({ resumenProblema: "El flujo de n8n falla al recibir un lead" });

    expect(resolveChannelId).toHaveBeenCalledWith(client, "tecnico-spectrum");
    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C_AGENTES",
        text: expect.stringContaining("<@U_TECH_AGENT>"),
      }),
    );
    expect(createHandoff).toHaveBeenCalledWith({
      threadTs: "1699999999.000100",
      sharedChannelId: "C_AGENTES",
      originalSlackUserId: "U_CLIENTE",
      originalChannelId: "C_CLIENTE_DM",
      resumenProblema: "El flujo de n8n falla al recibir un lead",
    });
    expect(result).toContain("Ya le pasé el caso al equipo técnico");
  });

  it("no falla si el config no tiene un bot user ID configurado", async () => {
    resolveChannelId.mockResolvedValue("C_AGENTES");
    const client = fakeClient();
    const tool = createConsultTechAgentTool(client, "U_CLIENTE", "C_CLIENTE_DM", { ...FAKE_CONFIG, slackBotUserId: "" });

    const result = await tool.invoke({ resumenProblema: "algo falló" });

    expect(client.chat.postMessage).not.toHaveBeenCalled();
    expect(createHandoff).not.toHaveBeenCalled();
    expect(result).toContain("No tengo forma de contactar al equipo técnico");
  });

  it("no falla si no se encuentra el canal privado en Slack", async () => {
    resolveChannelId.mockResolvedValue(undefined);
    const client = fakeClient();
    const tool = createConsultTechAgentTool(client, "U_CLIENTE", "C_CLIENTE_DM", FAKE_CONFIG);

    const result = await tool.invoke({ resumenProblema: "algo falló" });

    expect(client.chat.postMessage).not.toHaveBeenCalled();
    expect(createHandoff).not.toHaveBeenCalled();
    expect(result).toContain("No tengo forma de contactar al equipo técnico");
  });
});
