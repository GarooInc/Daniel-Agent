import { beforeEach, describe, expect, it, vi } from "vitest";

const getClientWiki = vi.fn();
const saveClientWiki = vi.fn().mockResolvedValue(undefined);
const invoke = vi.fn();

vi.mock("../integrations/postgres/client-wiki.js", () => ({ getClientWiki, saveClientWiki }));
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    invoke = invoke;
  },
}));

const { compileClientWikiFromDiagnosis } = await import("./compile-client-wiki.js");

const HANDOFF = {
  threadTs: "1699999999.000100",
  sharedChannelId: "C_AGENTES",
  originalSlackUserId: "U_CLIENTE",
  originalChannelId: "C_CLIENTE_DM",
  resumenProblema: "El flujo de n8n falla al recibir un lead",
  mondayItemId: "3200000000",
  status: "answered" as const,
  createdAt: new Date(),
};

describe("compileClientWikiFromDiagnosis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no hace nada si el diagnóstico no trae causaRaiz ni componenteAfectado (sigue investigando)", async () => {
    await compileClientWikiFromDiagnosis("Spectrum", HANDOFF, {});

    expect(getClientWiki).not.toHaveBeenCalled();
    expect(saveClientWiki).not.toHaveBeenCalled();
  });

  it("arranca de un scaffold de secciones cuando el cliente no tiene página todavía", async () => {
    getClientWiki.mockResolvedValue(null);
    invoke.mockResolvedValue({ content: "## Resumen del sistema\n\nUsa n8n para procesar leads..." });

    await compileClientWikiFromDiagnosis("Spectrum", HANDOFF, { causaRaiz: "El nodo Webhook no valida el JSON", componenteAfectado: "Nodo Webhook" });

    expect(invoke).toHaveBeenCalledWith(expect.stringContaining("## Resumen del sistema"));
    expect(saveClientWiki).toHaveBeenCalledWith("Spectrum", "## Resumen del sistema\n\nUsa n8n para procesar leads...", ["1699999999.000100"]);
  });

  it("fusiona con la página existente y acumula la fuente nueva sin duplicar las viejas", async () => {
    getClientWiki.mockResolvedValue({ contenido: "## Resumen del sistema\n\nPágina vieja", fuentes: ["1699999998.000050"], updatedAt: new Date() });
    invoke.mockResolvedValue({ content: "## Resumen del sistema\n\nPágina actualizada con el diagnóstico nuevo" });

    await compileClientWikiFromDiagnosis("Spectrum", HANDOFF, { causaRaiz: "causa", componenteAfectado: "componente" });

    expect(invoke).toHaveBeenCalledWith(expect.stringContaining("Página vieja"));
    expect(saveClientWiki).toHaveBeenCalledWith("Spectrum", "## Resumen del sistema\n\nPágina actualizada con el diagnóstico nuevo", [
      "1699999998.000050",
      "1699999999.000100",
    ]);
  });

  it("no duplica la fuente si el mismo threadTs ya estaba registrado", async () => {
    getClientWiki.mockResolvedValue({ contenido: "página", fuentes: ["1699999999.000100"], updatedAt: new Date() });
    invoke.mockResolvedValue({ content: "página actualizada" });

    await compileClientWikiFromDiagnosis("Spectrum", HANDOFF, { causaRaiz: "causa" });

    expect(saveClientWiki).toHaveBeenCalledWith("Spectrum", "página actualizada", ["1699999999.000100"]);
  });
});
