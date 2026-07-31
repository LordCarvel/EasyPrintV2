import { localRoutingApi } from './localRoutingStore';

export const CURRENT_STORE_KEY = 'easyPrintRoutingCurrentStoreId';
export const SESSION_TOKEN_KEY = 'easyPrintRoutingSessionToken';
const configuredDataMode = String(import.meta.env.VITE_DATA_MODE || 'hybrid').trim().toLowerCase();
export const DATA_MODE = ['local', 'remote', 'hybrid'].includes(configuredDataMode)
  ? configuredDataMode
  : 'hybrid';
export const LOCAL_DATA_MODE = DATA_MODE !== 'remote';
export const SHARED_ORDERS_MODE = DATA_MODE !== 'local';

const LOCAL_API_URL = 'http://127.0.0.1:3333';
const RENDER_API_URL = 'https://easyprint-routing-api.onrender.com';
const ROUTING_API_URL_OVERRIDE_KEY = 'easyPrintRoutingApiUrl';
const ORDER_RELAY_TOKEN_KEY_PREFIX = 'easyPrintOrderRelayToken:';
let orderRelaySessionPromise = null;

const LOCAL_API_URL_PATTERN = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i;

const isPackagedDesktopUrl = () => {
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'easyhub:' || window.location.protocol === 'file:';
};

const getDefaultRoutingApiUrl = () => {
  if (typeof window !== 'undefined') {
    const isGithubPagesUrl = window.location.hostname.endsWith('github.io');

    if (isGithubPagesUrl || isPackagedDesktopUrl()) {
      return import.meta.env.VITE_ROUTING_API_URL || RENDER_API_URL;
    }
  }

  return import.meta.env.VITE_ROUTING_API_URL || LOCAL_API_URL;
};

export const getRoutingApiUrl = () => {
  if (typeof window === 'undefined') return LOCAL_API_URL;

  const storedApiUrl = window.localStorage.getItem(ROUTING_API_URL_OVERRIDE_KEY);
  if (!storedApiUrl) return getDefaultRoutingApiUrl();

  if (isPackagedDesktopUrl() && LOCAL_API_URL_PATTERN.test(storedApiUrl)) {
    window.localStorage.removeItem(ROUTING_API_URL_OVERRIDE_KEY);
    return getDefaultRoutingApiUrl();
  }

  return storedApiUrl;
};

export const getCurrentStoreId = () => {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(CURRENT_STORE_KEY) || '';
};

export const getSessionToken = () => {
  if (typeof window === 'undefined') return '';
  const storedToken = window.localStorage.getItem(SESSION_TOKEN_KEY) || '';
  if (storedToken || !LOCAL_DATA_MODE) return storedToken;

  const currentStoreId = getCurrentStoreId();
  if (!currentStoreId) return '';
  const localToken = `local:${currentStoreId}`;
  window.localStorage.setItem(SESSION_TOKEN_KEY, localToken);
  return localToken;
};

export const setCurrentStoreId = (storeId) => {
  window.localStorage.setItem(CURRENT_STORE_KEY, storeId);
};

export const setAuthSession = ({ token, store }) => {
  window.localStorage.setItem(SESSION_TOKEN_KEY, token);
  window.localStorage.setItem(CURRENT_STORE_KEY, store?.id || '');
};

const getOrderRelayTokenKey = (storeId) => `${ORDER_RELAY_TOKEN_KEY_PREFIX}${storeId}`;

const getStoredOrderRelayToken = (storeId) => {
  if (typeof window === 'undefined' || !storeId) return '';
  return window.localStorage.getItem(getOrderRelayTokenKey(storeId)) || '';
};

const clearOrderRelayToken = (storeId) => {
  if (typeof window === 'undefined' || !storeId) return;
  window.localStorage.removeItem(getOrderRelayTokenKey(storeId));
};

export const clearCurrentStoreId = () => {
  clearOrderRelayToken(getCurrentStoreId());
  window.localStorage.removeItem(CURRENT_STORE_KEY);
  window.localStorage.removeItem(SESSION_TOKEN_KEY);
};

export async function apiRequest(path, options = {}) {
  const {
    method = 'GET',
    body,
    sessionToken = getSessionToken(),
    requireStore = true
  } = options;
  const headers = {
    'Content-Type': 'application/json'
  };

  if (requireStore && sessionToken) {
    headers['X-Session-Token'] = sessionToken;
  }

  const response = await fetch(`${getRoutingApiUrl()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const error = new Error(payload?.error || 'Falha na comunicacao com o servidor.');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

const createOrderRelaySession = async () => {
  const storeId = getCurrentStoreId();
  if (!storeId) throw new Error('Escolha a loja antes de compartilhar pedidos.');

  const session = await apiRequest('/api/order-relay/session', {
    method: 'POST',
    body: { storeId },
    requireStore: false,
    sessionToken: ''
  });
  window.localStorage.setItem(getOrderRelayTokenKey(storeId), session.token);
  return session.token;
};

const ensureOrderRelayToken = async () => {
  const storeId = getCurrentStoreId();
  const storedToken = getStoredOrderRelayToken(storeId);
  if (storedToken) return storedToken;

  if (!orderRelaySessionPromise) {
    orderRelaySessionPromise = createOrderRelaySession()
      .finally(() => {
        orderRelaySessionPromise = null;
      });
  }
  return orderRelaySessionPromise;
};

const orderApiRequest = async (path, options = {}, allowSessionRefresh = true) => {
  const storeId = getCurrentStoreId();
  const relayToken = await ensureOrderRelayToken();

  try {
    return await apiRequest(path, { ...options, sessionToken: relayToken });
  } catch (error) {
    if (allowSessionRefresh && error.status === 401) {
      clearOrderRelayToken(storeId);
      return orderApiRequest(path, options, false);
    }
    throw error;
  }
};

const buildOrderListPath = (kind, options = {}) => {
  const params = new URLSearchParams();
  if (options.updatedAfter) params.set('updatedAfter', options.updatedAfter);
  const query = params.toString();
  return `/api/orders/${kind}${query ? `?${query}` : ''}`;
};

const remoteRoutingApi = {
  listSetupStores: () => apiRequest('/api/setup/stores', { requireStore: false }),
  createSetupStore: (body) => apiRequest('/api/setup/stores', { method: 'POST', body, requireStore: false }),
  login: (body) => apiRequest('/api/auth/login', { method: 'POST', body, requireStore: false }),
  logout: () => apiRequest('/api/auth/logout', { method: 'POST' }),
  getMe: () => apiRequest('/api/me'),
  getSettings: () => apiRequest('/api/store-settings'),
  saveSettings: (body) => apiRequest('/api/store-settings', { method: 'PATCH', body }),
  saveMyStore: (body) => apiRequest('/api/me/store', { method: 'PATCH', body }),
  setConnection: (targetStoreId, canSendOrders) =>
    apiRequest(`/api/connections/${encodeURIComponent(targetStoreId)}`, {
      method: 'PUT',
      body: { canSendOrders }
    }),
  parseRoute: (rawText) => apiRequest('/api/orders/parse-route', {
    method: 'POST',
    body: { rawText }
  }),
  createOrder: ({ rawText, targetStoreId, routeConfirmed }) =>
    apiRequest('/api/orders', {
      method: 'POST',
      body: { rawText, targetStoreId, routeConfirmed }
    }),
  listReceivedOrders: (options) => apiRequest(buildOrderListPath('received', options)),
  listSentOrders: (options) => apiRequest(buildOrderListPath('sent', options)),
  getOrder: (orderId) => apiRequest(`/api/orders/${encodeURIComponent(orderId)}`),
  addOrderEvent: (orderId, body) =>
    apiRequest(`/api/orders/${encodeURIComponent(orderId)}/events`, {
      method: 'POST',
      body
    }),
  updateOrderStatus: (orderId, status, version) =>
    apiRequest(`/api/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PATCH',
      body: { status, version }
    }),
  markViewed: (orderId, version) =>
    apiRequest(`/api/orders/${encodeURIComponent(orderId)}/view`, {
      method: 'POST',
      body: { version }
    }),
  markPrinted: (orderId, version) =>
    apiRequest(`/api/orders/${encodeURIComponent(orderId)}/printed`, {
      method: 'POST',
      body: { version }
    }),
  cancelOrder: (orderId, version) =>
    apiRequest(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: 'POST',
      body: { version }
    })
};

const sharedOrderApi = {
  createOrder: ({ rawText, targetStoreId, routeConfirmed }) =>
    orderApiRequest('/api/orders', {
      method: 'POST',
      body: { rawText, targetStoreId, routeConfirmed }
    }),
  listReceivedOrders: (options) => orderApiRequest(buildOrderListPath('received', options)),
  listSentOrders: (options) => orderApiRequest(buildOrderListPath('sent', options)),
  getOrder: (orderId) => orderApiRequest(`/api/orders/${encodeURIComponent(orderId)}`),
  addOrderEvent: (orderId, body) =>
    orderApiRequest(`/api/orders/${encodeURIComponent(orderId)}/events`, {
      method: 'POST',
      body
    }),
  updateOrderStatus: (orderId, status, version) =>
    orderApiRequest(`/api/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PATCH',
      body: { status, version }
    }),
  markViewed: (orderId, version) =>
    orderApiRequest(`/api/orders/${encodeURIComponent(orderId)}/view`, {
      method: 'POST',
      body: { version }
    }),
  markPrinted: (orderId, version) =>
    orderApiRequest(`/api/orders/${encodeURIComponent(orderId)}/printed`, {
      method: 'POST',
      body: { version }
    }),
  cancelOrder: (orderId, version) =>
    orderApiRequest(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: 'POST',
      body: { version }
    })
};

const hybridRoutingApi = {
  ...localRoutingApi,
  ...sharedOrderApi
};

export const routingApi = DATA_MODE === 'remote'
  ? remoteRoutingApi
  : DATA_MODE === 'local'
    ? localRoutingApi
    : hybridRoutingApi;
