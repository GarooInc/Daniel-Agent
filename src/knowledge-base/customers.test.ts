import { describe, expect, it } from "vitest";
import { getAllCustomers, getCustomerByEmail } from "./customers.js";

describe("getCustomerByEmail", () => {
  it("encuentra un cliente por email exacto", () => {
    const customer = getCustomerByEmail("marcela.ibanez@construsur.com");
    expect(customer?.nombre).toBe("Marcela Ibáñez");
  });

  it("no distingue mayúsculas de minúsculas", () => {
    const customer = getCustomerByEmail("MARCELA.IBANEZ@construsur.com");
    expect(customer?.nombre).toBe("Marcela Ibáñez");
  });

  it("devuelve undefined para un email que no existe", () => {
    expect(getCustomerByEmail("no-existe@nadie.com")).toBeUndefined();
  });
});

describe("getAllCustomers", () => {
  it("devuelve todos los clientes cargados del JSON", () => {
    expect(getAllCustomers().length).toBeGreaterThan(0);
  });
});
