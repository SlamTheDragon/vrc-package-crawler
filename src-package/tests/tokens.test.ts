import { describe, it, expect } from "bun:test";
import {
  formatAppToken,
  isAppToken,
  formatUserToken,
  isUserToken
} from "../src/auth/tokens.ts";

describe("src-package auth tokens (consumer only)", () => {
  it("formats and validates app tokens (vrcp_app_<64-hex>)", () => {
    const hex64 = "a".repeat(64);
    const token = formatAppToken(hex64);
    expect(token).toBe(`vrcp_app_${hex64}`);
    expect(token.length).toBe(73);
    expect(isAppToken(token)).toBe(true);

    expect(isAppToken("vrcp_app_short")).toBe(false);
    expect(isAppToken(`vrcp_usr_${hex64}`)).toBe(false);
    expect(isAppToken(`vrcp_app_${"G".repeat(64)}`)).toBe(false);
  });

  it("formats and validates user tokens (vrcp_usr_<64-hex>)", () => {
    const hex64 = "b".repeat(64);
    const token = formatUserToken(hex64);
    expect(token).toBe(`vrcp_usr_${hex64}`);
    expect(token.length).toBe(73);
    expect(isUserToken(token)).toBe(true);

    expect(isUserToken("vrcp_usr_invalid")).toBe(false);
    expect(isUserToken(`vrcp_app_${hex64}`)).toBe(false);
  });
});
