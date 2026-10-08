import { describe, it, expect } from "bun:test";
import { UmbrellaSchema, ContentRatingSchema } from "../src/taxonomy/taxonomy.ts";

describe("src-package consumer taxonomy & schemas", () => {
  it("validates the three owner-approved umbrella values", () => {
    expect(UmbrellaSchema.parse("tools")).toBe("tools");
    expect(UmbrellaSchema.parse("assets")).toBe("assets");
    expect(UmbrellaSchema.parse("avatars")).toBe("avatars");
    expect(() => UmbrellaSchema.parse("invalid")).toThrow();
    expect(() => UmbrellaSchema.parse("vpm")).toThrow();
  });

  it("validates the six scaled content rating values and rejects unapproved strings", () => {
    const validRatings = [
      "general",
      "mature",
      "sexual_suggestive",
      "adult_restricted",
      "unknown_restricted",
      "prohibited"
    ] as const;
    for (const r of validRatings) {
      expect(ContentRatingSchema.parse(r)).toBe(r);
    }
    expect(() => ContentRatingSchema.parse("nsfw")).toThrow();
    expect(() => ContentRatingSchema.parse("explicit")).toThrow();
    expect(() => ContentRatingSchema.parse("r18")).toThrow();
    expect(() => ContentRatingSchema.parse("")).toThrow();
  });
});
