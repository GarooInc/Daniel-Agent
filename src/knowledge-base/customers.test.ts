import { describe, expect, it } from "vitest";
import { getAllCustomers } from "./customers.js";

describe("getAllCustomers", () => {
  it("devuelve todos los clientes cargados del JSON", () => {
    expect(getAllCustomers().length).toBeGreaterThan(0);
  });
});
