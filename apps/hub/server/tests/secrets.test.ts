import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  generateSecretsKey,
  parseSecretsKey,
} from "../src/secrets.js";

describe("hub secrets", () => {
  it("round-trips AES-GCM credentials", () => {
    const key = parseSecretsKey(generateSecretsKey());
    const enc = encryptSecret("super-secret-api-key", key);
    expect(enc).not.toContain("super-secret");
    expect(decryptSecret(enc, key)).toBe("super-secret-api-key");
  });

  it("accepts 64-char hex keys", () => {
    const hex = "a".repeat(64);
    expect(parseSecretsKey(hex).length).toBe(32);
  });
});
