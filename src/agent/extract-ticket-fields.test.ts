import { describe, expect, it } from "vitest";
import { esNombreDeProducto } from "./extract-ticket-fields.js";

describe("esNombreDeProducto", () => {
  it("detecta un nombre de producto extraído por error como nombre del cliente", () => {
    // Bug real en vivo (2026-08-05): "...dar de alta un cliente en Sofi" hizo que la
    // extracción devolviera nombreCliente="Sofi" en vez del nombre real del cliente.
    expect(esNombreDeProducto("Sofi")).toBe(true);
    expect(esNombreDeProducto("Isabella")).toBe(true);
    expect(esNombreDeProducto("Widget-chatbot")).toBe(true);
  });

  it("no es sensible a mayúsculas/minúsculas ni a espacios de más", () => {
    expect(esNombreDeProducto("  sofi  ")).toBe(true);
    expect(esNombreDeProducto("ISABELLA")).toBe(true);
  });

  it("no marca un nombre real de cliente como producto", () => {
    expect(esNombreDeProducto("Ana López")).toBe(false);
    expect(esNombreDeProducto("Jorge Calderón")).toBe(false);
  });

  it("no marca un nombre que solo contiene un producto como substring", () => {
    // Para no ser demasiado agresivo: solo rechaza coincidencia exacta con el nombre del
    // producto, no cualquier nombre que lo contenga (ej. alguien que de verdad se llame así).
    expect(esNombreDeProducto("Isabella Fernández")).toBe(false);
  });

  it("devuelve false para undefined", () => {
    expect(esNombreDeProducto(undefined)).toBe(false);
  });
});
