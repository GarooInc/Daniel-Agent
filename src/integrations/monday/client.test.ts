import { describe, expect, it } from "vitest";
import { MondayApiError } from "./client.js";

describe("MondayApiError", () => {
  it("es una instancia de Error con name propio para poder filtrarla en logs", () => {
    const error = new MondayApiError("algo salió mal");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MondayApiError");
    expect(error.message).toBe("algo salió mal");
  });
});
