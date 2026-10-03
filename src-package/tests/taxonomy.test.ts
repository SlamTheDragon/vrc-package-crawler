import { describe, it, expect } from "bun:test";
import { UmbrellaSchema } from "../src/taxonomy/taxonomy.ts";

describe("src-package consumer taxonomy & schemas", () => {
  it("validates the three owner-approved umbrella values", () => {
    expect(UmbrellaSchema.parse("tools")).toBe("tools");
    expect(UmbrellaSchema.parse("assets")).toBe("assets");
    expect(UmbrellaSchema.parse("avatars")).toBe("avatars");
    expect(() => UmbrellaSchema.parse("invalid")).toThrow();

    expect(() => UmbrellaSchema.parse("vpm")).toThrow();
  });

});
