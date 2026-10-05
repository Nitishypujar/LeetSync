import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { getEnv } from './config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

const toBase64Url = (value: Buffer): string => value.toString('base64url');
const fromBase64Url = (value: string): Buffer =>
  Buffer.from(value, 'base64url');

export function hashToken(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function equalSecrets(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function encryptSecret(plaintext: string): string {
  const key = Buffer.from(getEnv().TOKEN_ENCRYPTION_KEY, 'hex');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${toBase64Url(iv)}.${toBase64Url(tag)}.${toBase64Url(ciphertext)}`;
}

export function decryptSecret(payload: string): string {
  const [ivPart, tagPart, ciphertextPart] = payload.split('.');
  if (!ivPart || !tagPart || !ciphertextPart) {
    throw new Error('Invalid encrypted secret format');
  }

  const key = Buffer.from(getEnv().TOKEN_ENCRYPTION_KEY, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, fromBase64Url(ivPart));
  decipher.setAuthTag(fromBase64Url(tagPart));
  const plaintext = Buffer.concat([
    decipher.update(fromBase64Url(ciphertextPart)),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
