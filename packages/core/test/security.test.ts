import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  hashPassword,
  hotp,
  newRecoveryCodes,
  newToken,
  sha256,
  totp,
  verifyPassword,
  verifyTotp,
} from "../src/security";

describe("passwords", () => {
  it("hashes and verifies", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong horse battery", hash)).toBe(false);
  });
  it("rejects short passwords", async () => {
    await expect(hashPassword("short")).rejects.toThrow();
  });
  it("rejects malformed hashes", async () => {
    expect(await verifyPassword("x", "bcrypt$abc")).toBe(false);
  });
});

describe("tokens and encryption", () => {
  it("hashes tokens consistently", () => {
    const { token, hash } = newToken();
    expect(sha256(token).equals(hash)).toBe(true);
  });
  it("round-trips AES-GCM and detects tampering", () => {
    const key = randomBytes(32).toString("base64");
    const ct = encryptSecret("secret value", key);
    expect(decryptSecret(ct, key)).toBe("secret value");
    const parts = ct.split(".");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
  });
});

describe("TOTP (RFC 6238 / RFC 4226 vectors)", () => {
  const rfcSecret = base32Encode(Buffer.from("12345678901234567890"));
  it("matches RFC 4226 HOTP vectors", () => {
    expect(hotp(rfcSecret, 0)).toBe("755224");
    expect(hotp(rfcSecret, 1)).toBe("287082");
    expect(hotp(rfcSecret, 9)).toBe("520489");
  });
  it("matches RFC 6238 SHA-1 vector at T=59", () => {
    // RFC gives 8 digits 94287082; 6-digit truncation is 287082
    expect(totp(rfcSecret, 59_000)).toBe("287082");
  });
  it("verifies within window and rejects outside", () => {
    const now = 1_700_000_000_000;
    const code = totp(rfcSecret, now);
    expect(verifyTotp(rfcSecret, code, now)).not.toBeNull();
    expect(verifyTotp(rfcSecret, code, now + 30_000)).not.toBeNull();
    expect(verifyTotp(rfcSecret, code, now + 120_000)).toBeNull();
    expect(verifyTotp(rfcSecret, "abc123", now)).toBeNull();
  });
  it("round-trips base32", () => {
    const buf = randomBytes(20);
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });
  it("creates unique recovery codes", () => {
    const codes = newRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  });
});
