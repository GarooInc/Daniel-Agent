import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const embedTexts = vi.fn();

vi.mock("./client.js", () => ({ getPool: async () => ({ query }) }));
vi.mock("../embeddings/openrouter-embeddings.js", () => ({ embedTexts }));
vi.mock("../../config/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

const { runSync, resetFaqEmbeddingSyncState } = await import("./faq-embedding-sync.js");

const fila = (id: string, respuesta = "r") => ({ id, pregunta: `p-${id}`, respuesta });
const vector = () => new Array(1536).fill(0.1);

function filasEnBD(rows: ReturnType<typeof fila>[]): void {
  query.mockImplementation(async (sql: string) => (sql.startsWith("SELECT") ? { rows } : { rows: [] }));
}
const updates = () => query.mock.calls.filter(([sql]) => String(sql).startsWith("UPDATE"));

describe("runSync (faq-embedding-sync)", () => {
  beforeEach(() => {
    query.mockReset();
    embedTexts.mockReset();
    embedTexts.mockImplementation(async (textos: string[]) => textos.map(vector));
    resetFaqEmbeddingSyncState();
  });

  it("en el primer barrido embebe todas las filas", async () => {
    filasEnBD([fila("a"), fila("b")]);
    await runSync();
    expect(embedTexts).toHaveBeenCalledTimes(1);
    expect(embedTexts.mock.calls[0][0]).toHaveLength(2);
    expect(updates()).toHaveLength(2);
  });

  it("en un segundo barrido sin cambios no llama a OpenRouter ni hace UPDATE", async () => {
    filasEnBD([fila("a"), fila("b")]);
    await runSync();
    embedTexts.mockClear();
    query.mockClear();
    filasEnBD([fila("a"), fila("b")]);
    await runSync();
    expect(embedTexts).not.toHaveBeenCalled();
    expect(updates()).toHaveLength(0);
  });

  it("reembebe solo la fila cuyo texto cambió", async () => {
    filasEnBD([fila("a"), fila("b")]);
    await runSync();
    embedTexts.mockClear();
    query.mockClear();
    filasEnBD([fila("a"), fila("b", "respuesta editada desde el panel")]);
    await runSync();
    expect(embedTexts).toHaveBeenCalledTimes(1);
    expect(embedTexts.mock.calls[0][0]).toHaveLength(1);
    expect(updates()).toHaveLength(1);
    expect(updates()[0][1][1]).toBe("b");
  });

  it("si falla OpenRouter no marca nada como al día y reintenta en el próximo barrido", async () => {
    filasEnBD([fila("a")]);
    embedTexts.mockRejectedValueOnce(new Error("timeout"));
    await runSync();
    expect(updates()).toHaveLength(0);
    await runSync();
    expect(updates()).toHaveLength(1);
  });

  it("si una fila se borra y vuelve a aparecer con el mismo texto, se reembebe", async () => {
    filasEnBD([fila("a")]);
    await runSync();
    filasEnBD([]);
    await runSync();
    embedTexts.mockClear();
    filasEnBD([fila("a")]);
    await runSync();
    expect(embedTexts).toHaveBeenCalledTimes(1);
  });
});
