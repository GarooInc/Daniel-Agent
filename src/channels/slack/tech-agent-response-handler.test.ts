import { beforeEach, describe, expect, it, vi } from "vitest";

const findPendingHandoffByThreadTs = vi.fn();
const deliverTechDiagnosis = vi.fn().mockResolvedValue(undefined);

vi.mock("../../integrations/mongo/tech-agent-handoff.js", () => ({ findPendingHandoffByThreadTs }));
vi.mock("../../agent/deliver-tech-diagnosis.js", () => ({ deliverTechDiagnosis }));

const { registerTechAgentResponseHandler } = await import("./tech-agent-response-handler.js");

function fakeApp() {
  let handler!: (args: { message: any; client: any }) => Promise<void>;
  const app = {
    message: (fn: any) => {
      handler = fn;
    },
  };
  return {
    app: app as any,
    trigger: (message: any, client: any = {}) => handler({ message, client }),
  };
}

describe("registerTechAgentResponseHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("entrega el diagnóstico cuando el mensaje menciona a Daniel y hay un handoff pendiente", async () => {
    const { app, trigger } = fakeApp();
    registerTechAgentResponseHandler(app, "U_DANIEL");
    const handoff = { threadTs: "111.222", status: "pending" };
    findPendingHandoffByThreadTs.mockResolvedValue(handoff);
    const client = {};

    await trigger({ text: "Ya lo resolví <@U_DANIEL>", thread_ts: "111.222", client_msg_id: "evt-1" }, client);

    expect(findPendingHandoffByThreadTs).toHaveBeenCalledWith("111.222");
    expect(deliverTechDiagnosis).toHaveBeenCalledWith(client, handoff, "Ya lo resolví <@U_DANIEL>");
  });

  it("ignora mensajes que no mencionan explícitamente a Daniel (narración libre en el hilo)", async () => {
    const { app, trigger } = fakeApp();
    registerTechAgentResponseHandler(app, "U_DANIEL");

    await trigger({ text: "Dejame revisar esto...", thread_ts: "111.222", client_msg_id: "evt-2" });

    expect(findPendingHandoffByThreadTs).not.toHaveBeenCalled();
  });

  it("ignora mensajes sin thread_ts (no es una respuesta a un handoff)", async () => {
    const { app, trigger } = fakeApp();
    registerTechAgentResponseHandler(app, "U_DANIEL");

    await trigger({ text: "<@U_DANIEL> hola", client_msg_id: "evt-3" });

    expect(findPendingHandoffByThreadTs).not.toHaveBeenCalled();
  });

  it("no entrega nada si no hay handoff pendiente para ese threadTs", async () => {
    const { app, trigger } = fakeApp();
    registerTechAgentResponseHandler(app, "U_DANIEL");
    findPendingHandoffByThreadTs.mockResolvedValue(null);

    await trigger({ text: "<@U_DANIEL> listo", thread_ts: "999.999", client_msg_id: "evt-4" });

    expect(deliverTechDiagnosis).not.toHaveBeenCalled();
  });

  it("dedupea el mismo client_msg_id (Slack puede reenviar el evento)", async () => {
    const { app, trigger } = fakeApp();
    registerTechAgentResponseHandler(app, "U_DANIEL");
    findPendingHandoffByThreadTs.mockResolvedValue({ threadTs: "111.222" });

    await trigger({ text: "<@U_DANIEL> listo", thread_ts: "111.222", client_msg_id: "evt-dup" });
    await trigger({ text: "<@U_DANIEL> listo", thread_ts: "111.222", client_msg_id: "evt-dup" });

    expect(deliverTechDiagnosis).toHaveBeenCalledTimes(1);
  });
});
