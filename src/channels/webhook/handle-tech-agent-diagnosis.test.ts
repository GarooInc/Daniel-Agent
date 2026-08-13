import { beforeEach, describe, expect, it, vi } from "vitest";

const findPendingHandoffByThreadTs = vi.fn();
const deliverTechDiagnosis = vi.fn().mockResolvedValue(undefined);

vi.mock("../../integrations/mongo/tech-agent-handoff.js", () => ({ findPendingHandoffByThreadTs }));
vi.mock("../../agent/deliver-tech-diagnosis.js", () => ({ deliverTechDiagnosis }));

const { handleTechAgentDiagnosis, isTechAgentDiagnosisPayload } = await import("./handle-tech-agent-diagnosis.js");

describe("isTechAgentDiagnosisPayload", () => {
  it("acepta un payload con type/threadTs/mensaje válidos", () => {
    expect(isTechAgentDiagnosisPayload({ type: "tech_agent_diagnosis", threadTs: "123.456", mensaje: "listo" })).toBe(true);
  });

  it("rechaza cualquier otro type o payload incompleto", () => {
    expect(isTechAgentDiagnosisPayload({ type: "otra_cosa", threadTs: "123.456", mensaje: "listo" })).toBe(false);
    expect(isTechAgentDiagnosisPayload({ type: "tech_agent_diagnosis", threadTs: "123.456" })).toBe(false);
    expect(isTechAgentDiagnosisPayload(null)).toBe(false);
    expect(isTechAgentDiagnosisPayload("texto suelto")).toBe(false);
  });
});

describe("handleTechAgentDiagnosis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("entrega el diagnóstico cuando hay un handoff pendiente para ese threadTs", async () => {
    const handoff = { threadTs: "123.456", status: "pending" as const };
    findPendingHandoffByThreadTs.mockResolvedValue(handoff);
    const client = {} as any;

    await handleTechAgentDiagnosis(client, { type: "tech_agent_diagnosis", threadTs: "123.456", mensaje: "ya lo resolví" });

    expect(deliverTechDiagnosis).toHaveBeenCalledWith(client, handoff, "ya lo resolví");
  });

  it("no falla y no entrega nada si no hay handoff pendiente para ese threadTs", async () => {
    findPendingHandoffByThreadTs.mockResolvedValue(null);
    const client = {} as any;

    await handleTechAgentDiagnosis(client, { type: "tech_agent_diagnosis", threadTs: "999.999", mensaje: "listo" });

    expect(deliverTechDiagnosis).not.toHaveBeenCalled();
  });
});
