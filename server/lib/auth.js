import crypto from 'node:crypto';

const ITERATIONS = 120000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

export const createPasswordHash = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password || ''), salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return { hash, salt };
};

export const verifyPassword = (password, hash, salt) => {
  if (!hash || !salt) return false;
  const candidate = crypto.pbkdf2Sync(String(password || ''), salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
};

export const createSessionToken = () => crypto.randomBytes(32).toString('hex');

export const normalizeUsername = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .trim();
