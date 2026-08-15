import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TechAgentConfig } from "../../config/tech-agents.js";

const createHandoff = vi.fn().mockResolvedValue(undefined);
const resolveChannelId = vi.fn();

vi.mock("../../integrations/mongo/tech-agent-handoff.js", () => ({ createHandoff }));
vi.mock("../../integrations/slack/resolve-channel.js", () => ({ resolveChannelId }));

const { notifyTechAgent } = await import("./consult-tech-agent.js");

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

describe("notifyTechAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posta en el canal privado del cliente y guarda el handoff con el mondayItemId cuando todo está configurado", async () => {
    resolveChannelId.mockResolvedValue("C_AGENTES");
    const client = fakeClient({ ts: "1699999999.000100" });

    await notifyTechAgent(client, "U_CLIENTE", "C_CLIENTE_DM", FAKE_CONFIG, "El flujo de n8n falla al recibir un lead", "3200000000");

    expect(resolveChannelId).toHaveBeenCalledWith(client, "tecnico-spectrum");
    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C_AGENTES",
        text: expect.stringContaining("<@U_TECH_AGENT>"),
      }),
    );
    expect(client.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("#3200000000") }));
    expect(createHandoff).toHaveBeenCalledWith({
      threadTs: "1699999999.000100",
      sharedChannelId: "C_AGENTES",
      originalSlackUserId: "U_CLIENTE",
      originalChannelId: "C_CLIENTE_DM",
      resumenProblema: "El flujo de n8n falla al recibir un lead",
      mondayItemId: "3200000000",
    });
  });

  it("no falla si el config no tiene un bot user ID configurado", async () => {
    resolveChannelId.mockResolvedValue("C_AGENTES");
    const client = fakeClient();

    await notifyTechAgent(client, "U_CLIENTE", "C_CLIENTE_DM", { ...FAKE_CONFIG, slackBotUserId: "" }, "algo falló", "3200000001");

    expect(client.chat.postMessage).not.toHaveBeenCalled();
    expect(createHandoff).not.toHaveBeenCalled();
  });

  it("no falla si no se encuentra el canal privado en Slack", async () => {
    resolveChannelId.mockResolvedValue(undefined);
    const client = fakeClient();

    await notifyTechAgent(client, "U_CLIENTE", "C_CLIENTE_DM", FAKE_CONFIG, "algo falló", "3200000002");

    expect(client.chat.postMessage).not.toHaveBeenCalled();
    expect(createHandoff).not.toHaveBeenCalled();
  });
});
