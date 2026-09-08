import { beforeEach, describe, expect, it, vi } from "vitest";

const changeTicketPriority = vi.fn().mockResolvedValue(undefined);
const changeTicketStatus = vi.fn().mockResolvedValue(undefined);
const addTicketUpdate = vi.fn().mockResolvedValue(undefined);
const findLatestTicketBySlackUser = vi.fn();

vi.mock("../../integrations/monday/index.js", () => ({
  changeTicketPriority,
  changeTicketStatus,
  addTicketUpdate,
  ESTADO_VALUES: ["Working on it", "Done", "Stuck", "Testing"],
}));
vi.mock("../../integrations/monday/create-ticket.js", () => ({ URGENCIA_VALUES: ["No es urgente", "Urgente"] }));
vi.mock("../../integrations/postgres/ticket-conversations.js", () => ({ findLatestTicketBySlackUser }));

const { createModifyTicketTool } = await import("./modify-ticket.js");

describe("modificar_ticket tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no hace nada y avisa si no se pidió ningún cambio", async () => {
    const tool = createModifyTicketTool("U123");

    const result = await tool.invoke({});

    expect(findLatestTicketBySlackUser).not.toHaveBeenCalled();
    expect(result).toContain("No especificaste ningún cambio");
  });

  it("avisa si no hay ningún ticket escalado en la conversación", async () => {
    findLatestTicketBySlackUser.mockResolvedValue(null);
    const tool = createModifyTicketTool("U123");

    const result = await tool.invoke({ informacionAdicional: "también me pasa esto" });

    expect(result).toContain("No encontré ningún ticket");
    expect(addTicketUpdate).not.toHaveBeenCalled();
  });

  it("agrega la información nueva como comentario al ticket más reciente", async () => {
    findLatestTicketBySlackUser.mockResolvedValue("3200000000");
    const tool = createModifyTicketTool("U123");

    const result = await tool.invoke({ informacionAdicional: "también me pasa esto" });

    expect(addTicketUpdate).toHaveBeenCalledWith("3200000000", "también me pasa esto");
    expect(result).toContain("#3200000000");
    expect(result).toContain("agregué la información nueva");
  });

  it("cambia urgencia y estado cuando se piden", async () => {
    findLatestTicketBySlackUser.mockResolvedValue("3200000001");
    const tool = createModifyTicketTool("U123");

    const result = await tool.invoke({ urgencia: "Urgente", estado: "Working on it" });

    expect(changeTicketPriority).toHaveBeenCalledWith("3200000001", "Urgente");
    expect(changeTicketStatus).toHaveBeenCalledWith("3200000001", "Working on it");
    expect(result).toContain("cambié la prioridad");
    expect(result).toContain("cambié el estado");
  });

  it("devuelve un mensaje de error si Monday falla", async () => {
    findLatestTicketBySlackUser.mockResolvedValue("3200000002");
    addTicketUpdate.mockRejectedValue(new Error("Monday API error: boom"));
    const tool = createModifyTicketTool("U123");

    const result = await tool.invoke({ informacionAdicional: "algo" });

    expect(result).toContain("No se pudo modificar el ticket");
  });
});
