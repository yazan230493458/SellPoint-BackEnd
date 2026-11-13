import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const base32Encode = (value: Buffer) => {
  let bits = 0;
  let current = 0;
  let output = "";
  for (const byte of value) {
    current = (current << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(current >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(current << (5 - bits)) & 31];
  return output;
};

const base32Decode = (value: string) => {
  let bits = 0;
  let current = 0;
  const bytes: number[] = [];
  for (const character of value.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) continue;
    current = (current << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

const encryptionKey = () => createHmac("sha256", process.env.JWT_SECRET ?? "").update("sellpoint-totp").digest();

export const generateTotpSecret = () => base32Encode(randomBytes(20));

export const encryptSecret = (secret: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
};

export const decryptSecret = (value: string) => {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) return "";
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
};

export const totpAt = (secret: string, counter: number) => {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 15;
  const binary = (
    ((digest[offset] ?? 0) & 127) << 24 |
    ((digest[offset + 1] ?? 0) & 255) << 16 |
    ((digest[offset + 2] ?? 0) & 255) << 8 |
    ((digest[offset + 3] ?? 0) & 255)
  );
  return String(binary % 1000000).padStart(6, "0");
};

export const verifyTotp = (secret: string, code: string, now = Date.now()) => {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(now / 30000);
  return [-1, 0, 1].some((delta) => {
    const expected = totpAt(secret, counter + delta);
    const left = Buffer.from(expected);
    const right = Buffer.from(code);
    return left.length === right.length && timingSafeEqual(left, right);
  });
};

export const otpauthUrl = (username: string, secret: string) =>
  `otpauth://totp/SellPoint:${encodeURIComponent(username)}?secret=${secret}&issuer=SellPoint&digits=6&period=30`;
