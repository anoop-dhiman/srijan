import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.SRIJAN_SECRETS_KEY || 'dev-key-32-bytes-long-change-me!';
if (ENCRYPTION_KEY === 'dev-key-32-bytes-long-change-me!') {
  console.error('[SECURITY] CRITICAL: SRIJAN_SECRETS_KEY is using the default dev value. Set a strong random key in production!');
}
// Derive a consistent 32-byte key using SHA-256 so key material is not weakened by padding
const KEY_BUF = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

/** Encrypt using AES-256-GCM (authenticated encryption). Format: v2:<iv_hex>:<authTag_hex>:<ciphertext_hex> */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY_BUF, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return 'v2:' + iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

/** Decrypt ciphertext. Supports both v2 (GCM) and legacy v1 (CBC) formats. */
export function decrypt(text: string): string {
  try {
    if (text.startsWith('v2:')) {
      // AES-256-GCM
      const parts = text.slice(3).split(':');
      if (parts.length !== 3) throw new Error('Invalid v2 ciphertext format');
      const [ivHex, authTagHex, ciphertext] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', KEY_BUF, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } else {
      // Legacy AES-256-CBC (v1 — no prefix or explicit v1: prefix)
      const raw = text.startsWith('v1:') ? text.slice(3) : text;
      const parts = raw.split(':');
      if (parts.length < 2) throw new Error('Invalid v1 ciphertext format');
      const ivHex = parts[0];
      const encrypted = parts.slice(1).join(':');
      // Legacy key derivation: padEnd(32).slice(0, 32) — kept for backward compat
      const legacyKey = Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32));
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', legacyKey, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
  } catch (err) {
    throw new Error('Decryption failed: data may be corrupt or key mismatch');
  }
}
