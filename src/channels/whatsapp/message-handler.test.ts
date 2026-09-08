import { beforeEach, describe, expect, it, vi } from "vitest";

const bufferMessage = vi.fn().mockResolvedValue(undefined);
const findEmpresaByGroupJid = vi.fn();

vi.mock("../../messaging/debounce-queue.js", () => ({ bufferMessage }));
vi.mock("../../integrations/postgres/whatsapp-groups.js", () => ({ findEmpresaByGroupJid }));
vi.mock("../../config/env.js", () => ({ env: { whatsappBotJid: "521555000@lid" } }));

const { registerMessageHandler } = await import("./message-handler.js");

function fakeSocket() {
  const handlers: Record<string, (payload: unknown) => void> = {};
  return {
    socket: {
      on: (event: string, fn: (payload: unknown) => void) => (handlers[event] = fn),
    } as any,
    emit: (event: string, payload: unknown) => handlers[event]?.(payload),
  };
}

function upsert(overrides: Partial<{ remoteJid: string; fromMe: boolean; mentionedJid: string[]; text: string }>) {
  return {
    event: "messages.upsert",
    instance: "RedtecBot",
    data: {
      key: { remoteJid: overrides.remoteJid ?? "120363000@g.us", fromMe: overrides.fromMe ?? false },
      message: {
        extendedTextMessage: { text: overrides.text ?? "@Daniel hola, necesito ayuda" },
      },
      contextInfo: { mentionedJid: overrides.mentionedJid ?? ["521555000@lid"] },
    },
  };
}

describe("registerMessageHandler (WhatsApp)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findEmpresaByGroupJid.mockResolvedValue("Spectrum");
  });

  it("bufferiza un mensaje de un grupo mapeado que menciona a Daniel", async () => {
    const { socket, emit } = fakeSocket();
    registerMessageHandler(socket);

    emit("messages.upsert", upsert({}));
    await vi.waitFor(() => expect(bufferMessage).toHaveBeenCalled());

    expect(bufferMessage).toHaveBeenCalledWith("whatsapp", "120363000@g.us", "120363000@g.us", "@Daniel hola, necesito ayuda");
  });

  it("ignora un mensaje que no menciona a Daniel", async () => {
    const { socket, emit } = fakeSocket();
    registerMessageHandler(socket);

    emit("messages.upsert", upsert({ mentionedJid: [] }));
    await new Promise((r) => setTimeout(r, 0));

    expect(bufferMessage).not.toHaveBeenCalled();
  });

  it("ignora un mensaje propio del bot (fromMe)", async () => {
    const { socket, emit } = fakeSocket();
    registerMessageHandler(socket);

    emit("messages.upsert", upsert({ fromMe: true }));
    await new Promise((r) => setTimeout(r, 0));

    expect(bufferMessage).not.toHaveBeenCalled();
  });

  it("ignora un chat que no es un grupo (no termina en @g.us)", async () => {
    const { socket, emit } = fakeSocket();
    registerMessageHandler(socket);

    emit("messages.upsert", upsert({ remoteJid: "521555999@s.whatsapp.net" }));
    await new Promise((r) => setTimeout(r, 0));

    expect(bufferMessage).not.toHaveBeenCalled();
  });

  it("ignora un grupo mencionado pero sin mapear a ningún cliente en whatsapp_groups", async () => {
    findEmpresaByGroupJid.mockResolvedValue(undefined);
    const { socket, emit } = fakeSocket();
    registerMessageHandler(socket);

    emit("messages.upsert", upsert({}));
    await vi.waitFor(() => expect(findEmpresaByGroupJid).toHaveBeenCalled());

    expect(bufferMessage).not.toHaveBeenCalled();
  });
});
