export const CURRENT_STORE_KEY = 'easyPrintRoutingCurrentStoreId';
export const SESSION_TOKEN_KEY = 'easyPrintRoutingSessionToken';

const LOCAL_API_URL = 'http://127.0.0.1:3333';
const RENDER_API_URL = 'https://easyprint-routing-api.onrender.com';
const ROUTING_API_URL_OVERRIDE_KEY = 'easyPrintRoutingApiUrl';

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
  return window.localStorage.getItem(SESSION_TOKEN_KEY) || '';
};

export const setCurrentStoreId = (storeId) => {
  window.localStorage.setItem(CURRENT_STORE_KEY, storeId);
};

export const setAuthSession = ({ token, store }) => {
  window.localStorage.setItem(SESSION_TOKEN_KEY, token);
  window.localStorage.setItem(CURRENT_STORE_KEY, store?.id || '');
};

export const clearCurrentStoreId = () => {
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

export const routingApi = {
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
  listReceivedOrders: () => apiRequest('/api/orders/received'),
  listSentOrders: () => apiRequest('/api/orders/sent'),
  getOrder: (orderId) => apiRequest(`/api/orders/${encodeURIComponent(orderId)}`),
  markViewed: (orderId) => apiRequest(`/api/orders/${encodeURIComponent(orderId)}/view`, { method: 'POST' }),
  markPrinted: (orderId) => apiRequest(`/api/orders/${encodeURIComponent(orderId)}/printed`, { method: 'POST' }),
  cancelOrder: (orderId) => apiRequest(`/api/orders/${encodeURIComponent(orderId)}/cancel`, { method: 'POST' })
};
