import { beforeEach, describe, expect, it, vi } from "vitest";

const bufferMessage = vi.fn().mockResolvedValue(undefined);
const listTechAgents = vi.fn().mockResolvedValue([]);
const findPendingHandoffByThreadTs = vi.fn();
const deliverTechDiagnosis = vi.fn().mockResolvedValue(undefined);

vi.mock("../../messaging/debounce-queue.js", () => ({ bufferMessage }));
vi.mock("../../integrations/postgres/tech-agents.js", () => ({ listTechAgents }));
vi.mock("../../integrations/postgres/tech-agent-handoff.js", () => ({ findPendingHandoffByThreadTs }));
vi.mock("../../agent/deliver-tech-diagnosis.js", () => ({ deliverTechDiagnosis }));

const { registerMessageHandler } = await import("./message-handler.js");
const { registerTechAgentResponseHandler } = await import("./tech-agent-response-handler.js");

function fakeApp() {
  const handlers: Array<(args: { message: any; client: any }) => Promise<void>> = [];
  const app = {
    message: (fn: any) => {
      handlers.push(fn);
    },
  };
  return {
    app: app as any,
    // Simula cómo Bolt despacha un único evento a TODOS los listeners registrados, en orden.
    trigger: (message: any, client: any = {}) => Promise.all(handlers.map((h) => h({ message, client }))),
  };
}

describe("registerMessageHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTechAgents.mockResolvedValue([]);
  });

  it("bufferiza un mensaje normal de un cliente que menciona a Daniel", async () => {
    const { app, trigger } = fakeApp();
    registerMessageHandler(app, "U_DANIEL");

    await trigger({
      text: "<@U_DANIEL> hola, necesito ayuda",
      user: "U_CLIENTE",
      channel: "C_SOPORTE",
      client_msg_id: "evt-1",
    });

    expect(bufferMessage).toHaveBeenCalledWith("slack", "U_CLIENTE", "C_SOPORTE", "hola, necesito ayuda");
  });

  it("ignora un mensaje cuyo autor es un bot de Agente Técnico conocido, aunque mencione a Daniel", async () => {
    listTechAgents.mockResolvedValue([{ empresa: "Spectrum", slackChannel: "tecnico-spectrum", slackBotUserId: "U_TECNICO" }]);
    const { app, trigger } = fakeApp();
    registerMessageHandler(app, "U_DANIEL");

    await trigger({
      text: "Ya lo resolví <@U_DANIEL>",
      user: "U_TECNICO",
      channel: "tecnico-spectrum",
      thread_ts: "111.222",
      client_msg_id: "evt-2",
    });

    expect(bufferMessage).not.toHaveBeenCalled();
  });

  it("dedupea el mismo client_msg_id (Slack puede reenviar el evento)", async () => {
    const { app, trigger } = fakeApp();
    registerMessageHandler(app, "U_DANIEL");
    const message = { text: "<@U_DANIEL> hola", user: "U_CLIENTE", channel: "C_SOPORTE", client_msg_id: "evt-dup" };

    await trigger(message);
    await trigger(message);

    expect(bufferMessage).toHaveBeenCalledTimes(1);
  });

  // Regresión del bug real (ver ESTADO-PROYECTO.md pendiente #12): antes de filtrar por autor y
  // namespacear el dedupe, el mensaje final del Técnico (mencionando a Daniel, en un hilo)
  // disparaba AMBOS handlers sobre el mismo evento — este, al correr primero, "gastaba" la
  // marca de dedupe compartida y tech-agent-response-handler nunca llegaba a entregar el
  // diagnóstico al cliente.
  it("no le roba la marca de dedupe a tech-agent-response-handler cuando el Técnico menciona a Daniel", async () => {
    listTechAgents.mockResolvedValue([{ empresa: "Spectrum", slackChannel: "tecnico-spectrum", slackBotUserId: "U_TECNICO" }]);
    findPendingHandoffByThreadTs.mockResolvedValue({ threadTs: "111.222" });

    const { app, trigger } = fakeApp();
    registerMessageHandler(app, "U_DANIEL");
    registerTechAgentResponseHandler(app, "U_DANIEL");

    const diagnostico = {
      text: "Encontré el problema, era un nodo mal configurado <@U_DANIEL>",
      user: "U_TECNICO",
      channel: "tecnico-spectrum",
      thread_ts: "111.222",
      client_msg_id: "evt-diagnostico",
    };
    await trigger(diagnostico);

    expect(bufferMessage).not.toHaveBeenCalled();
    expect(deliverTechDiagnosis).toHaveBeenCalledTimes(1);
  });
});
