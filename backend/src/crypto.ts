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
  return encryptSecretWithKey(plaintext, getEnv().TOKEN_ENCRYPTION_KEY);
}

export function encryptSecretWithKey(
  plaintext: string,
  keyHex: string,
): string {
  const key = Buffer.from(keyHex, 'hex');
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
  const env = getEnv();
  try {
    return decryptSecretWithKey(payload, env.TOKEN_ENCRYPTION_KEY);
  } catch (currentKeyError) {
    if (!env.TOKEN_ENCRYPTION_KEY_PREVIOUS) throw currentKeyError;
    return decryptSecretWithKey(payload, env.TOKEN_ENCRYPTION_KEY_PREVIOUS);
  }
}

export function decryptSecretWithKey(payload: string, keyHex: string): string {
  const [ivPart, tagPart, ciphertextPart] = payload.split('.');
  if (!ivPart || !tagPart || !ciphertextPart) {
    throw new Error('Invalid encrypted secret format');
  }

  const key = Buffer.from(keyHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, fromBase64Url(ivPart));
  decipher.setAuthTag(fromBase64Url(tagPart));
  const plaintext = Buffer.concat([
    decipher.update(fromBase64Url(ciphertextPart)),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/** Re-encrypts data from the previous key, and leaves already-rotated data intact. */
export function rotateEncryptedSecret(payload: string): string {
  const env = getEnv();
  return rotateEncryptedSecretWithKeys(
    payload,
    env.TOKEN_ENCRYPTION_KEY,
    env.TOKEN_ENCRYPTION_KEY_PREVIOUS,
  );
}

export function rotateEncryptedSecretWithKeys(
  payload: string,
  currentKey: string,
  previousKey?: string,
): string {
  try {
    decryptSecretWithKey(payload, currentKey);
    return payload;
  } catch (currentKeyError) {
    if (!previousKey) throw currentKeyError;
    const plaintext = decryptSecretWithKey(payload, previousKey);
    return encryptSecretWithKey(plaintext, currentKey);
  }
}
