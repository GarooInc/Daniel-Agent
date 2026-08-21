import { describe, expect, it, vi } from "vitest";

const getCustomerByEmail = vi.fn();
vi.mock("../../integrations/postgres/customer-profile.js", () => ({ getCustomerByEmail }));

const { lookupCustomerTool } = await import("./lookup-customer.js");

describe("buscar_cliente tool", () => {
  it("devuelve los datos del cliente si el email existe", async () => {
    getCustomerByEmail.mockResolvedValue({ nombreCliente: "Marcela Ibáñez", email: "marcela.ibanez@construsur.com", empresa: "ConstruSur" });

    const result = await lookupCustomerTool.invoke({ email: "marcela.ibanez@construsur.com" });

    expect(getCustomerByEmail).toHaveBeenCalledWith("marcela.ibanez@construsur.com");
    expect(result).toContain("Marcela Ibáñez");
  });

  it("avisa cuando el email no corresponde a ningún cliente", async () => {
    getCustomerByEmail.mockResolvedValue(null);

    const result = await lookupCustomerTool.invoke({ email: "no-existe@nadie.com" });

    expect(result).toBe("No se encontró ningún cliente con ese email.");
  });
});
