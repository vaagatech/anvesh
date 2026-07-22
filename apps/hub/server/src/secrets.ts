import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** AES-256-GCM encrypted blob stored as JSON in hub-state. */
export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

/** Parse ANVESH_HUB_SECRETS_KEY — 32-byte hex (64 chars) or base64. */
export function parseSecretsKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("ANVESH_HUB_SECRETS_KEY is empty.");
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    key = Buffer.from(trimmed, "hex");
  } else {
    key = Buffer.from(trimmed, "base64");
  }
  if (key.length !== 32) {
    throw new Error("ANVESH_HUB_SECRETS_KEY must decode to exactly 32 bytes.");
  }
  return key;
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload: EncryptedSecret = {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
  return JSON.stringify(payload);
}

export function decryptSecret(apiKeyEnc: string, key: Buffer): string {
  let payload: EncryptedSecret;
  try {
    payload = JSON.parse(apiKeyEnc) as EncryptedSecret;
  } catch {
    throw new Error("Invalid encrypted credential format.");
  }
  if (!payload.ciphertext || !payload.iv || !payload.tag) {
    throw new Error("Invalid encrypted credential payload.");
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function generateSecretsKey(): string {
  return randomBytes(32).toString("base64");
}
