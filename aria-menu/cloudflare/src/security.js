// Password hashing, session tokens and helpers, using only Web Crypto (available in Workers).
// Hash format matches backend/security.py: pbkdf2_sha256$<iterations>$<salt b64>$<digest b64>.
// Verification reads the iteration count from the stored hash, so the cost can be changed later.

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const LOGIN_FAILURE_LIMIT = 5;
export const LOGIN_FAILURE_WINDOW_SECONDS = 15 * 60;
// Workers' Web Crypto refuses PBKDF2 above 100000 iterations (NotSupportedError), on every plan.
// Local wrangler dev accepts more, so this cap is enforced here, not only by the platform.
// Never raise it: a higher count would make every password check fail in production.
const WORKERS_PBKDF2_MAX_ITERATIONS = 100000;
const DEFAULT_ITERATIONS = WORKERS_PBKDF2_MAX_ITERATIONS;
const MAX_ITERATIONS = WORKERS_PBKDF2_MAX_ITERATIONS;

const encoder = new TextEncoder();

export function passwordIterations(env) {
  const raw = env && env.PASSWORD_ITERATIONS;
  if (raw === undefined || raw === '') return DEFAULT_ITERATIONS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1000 || value > MAX_ITERATIONS) {
    throw new Error(`PASSWORD_ITERATIONS must be an integer between 1000 and ${MAX_ITERATIONS}`);
  }
  return value;
}

export function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function newToken() {
  return toBase64(randomBytes(32)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function tokenDigest(token) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password, iterations) {
  const salt = randomBytes(16);
  const digest = await pbkdf2(password, salt, iterations);
  return `pbkdf2_sha256$${iterations}$${toBase64(salt)}$${toBase64(digest)}`;
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function sameText(a, b) {
  return sameBytes(encoder.encode(String(a)), encoder.encode(String(b)));
}

export async function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
    const iterations = Number(parts[1]);
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) return false;
    const actual = await pbkdf2(password, fromBase64(parts[2]), iterations);
    return sameBytes(actual, fromBase64(parts[3]));
  } catch {
    return false;
  }
}

// Used for unknown usernames so the response time does not reveal which accounts exist.
let dummy = null;
export function dummyHash(iterations) {
  if (!dummy) dummy = hashPassword(`not-a-real-password-${newToken()}`, iterations);
  return dummy;
}

// Licence keys look like MCF-XXXX-XXXX-XXXX-XXXX. 80 random bits; the alphabet leaves out 0, 1, I and O.
// Only the SHA-256 digest is stored (the key is random, so a slow hash is not needed).
const LICENSE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LICENSE_BODY_RE = /^MCF[A-HJ-NP-Z2-9]{16}$/;

export function newLicenseKey() {
  const bytes = randomBytes(16);
  let body = '';
  for (const byte of bytes) body += LICENSE_ALPHABET[byte & 31];
  return `MCF-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}`;
}

// Accepts the key with or without dashes, in any letter case. Returns null when the shape is wrong.
export function normalizeLicenseKey(value) {
  if (typeof value !== 'string') return null;
  const text = value.toUpperCase().replace(/[\s-]/g, '');
  return LICENSE_BODY_RE.test(text) ? text : null;
}

export function codePointLength(text) {
  return [...text].length;
}
