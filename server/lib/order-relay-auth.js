import crypto from 'node:crypto';

const TOKEN_PREFIX = 'order-relay';
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const encode = (value) => Buffer.from(String(value), 'utf8').toString('base64url');
const decode = (value) => Buffer.from(String(value), 'base64url').toString('utf8');

const sign = (secret, value) =>
  crypto.createHmac('sha256', secret).update(value).digest('base64url');

const signaturesMatch = (left, right) => {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const createOrderRelayAuth = ({
  secret = crypto.randomBytes(32).toString('hex'),
  ttlMs = DEFAULT_TTL_MS
} = {}) => ({
  issue(storeId) {
    const normalizedStoreId = String(storeId || '').trim();
    if (!normalizedStoreId) throw new Error('Informe a loja para compartilhar pedidos.');

    const encodedStoreId = encode(normalizedStoreId);
    const expiresAt = Date.now() + ttlMs;
    const unsignedToken = `${TOKEN_PREFIX}.${encodedStoreId}.${expiresAt}`;
    return `${unsignedToken}.${sign(secret, unsignedToken)}`;
  },

  verify(token) {
    const [prefix, encodedStoreId, rawExpiresAt, signature, ...extra] = String(token || '').split('.');
    if (prefix !== TOKEN_PREFIX || !encodedStoreId || !rawExpiresAt || !signature || extra.length) return '';

    const expiresAt = Number(rawExpiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return '';

    const unsignedToken = `${prefix}.${encodedStoreId}.${rawExpiresAt}`;
    const expectedSignature = sign(secret, unsignedToken);
    if (!signaturesMatch(signature, expectedSignature)) return '';

    try {
      return decode(encodedStoreId).trim();
    } catch {
      return '';
    }
  }
});

