import { describe, expect, it } from "vitest";
import { lookupCustomerTool } from "./lookup-customer.js";

describe("buscar_cliente tool", () => {
  it("devuelve los datos del cliente si el email existe", async () => {
    const result = await lookupCustomerTool.invoke({ email: "marcela.ibanez@construsur.com" });
    expect(result).toContain("Marcela Ibáñez");
  });

  it("avisa cuando el email no corresponde a ningún cliente", async () => {
    const result = await lookupCustomerTool.invoke({ email: "no-existe@nadie.com" });
    expect(result).toBe("No se encontró ningún cliente con ese email.");
  });
});
