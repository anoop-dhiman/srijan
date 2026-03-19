import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.SRIJAN_SECRETS_KEY || 'dev-key-32-bytes-long-change-me!';
const KEY_BUF = Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32));

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY_BUF, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(text: string): string {
  const [ivHex, encrypted] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', KEY_BUF, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
