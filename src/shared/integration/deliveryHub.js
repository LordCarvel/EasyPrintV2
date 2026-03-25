export const DELIVERY_HUB_CONFIG_KEY = 'easyPrintHubIntegrationConfig';
export const DELIVERY_HUB_PENDING_EVENTS_KEY = 'easyPrintHubPendingEvents';
export const DELIVERY_HUB_PUBLISHED_ORDERS_KEY = 'easyPrintHubPublishedOrders';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8080';
const DEFAULT_APP_ID = 'easy-print';
const PENDING_EVENT_NAME = 'incoming_order_registered';

export const DEFAULT_DELIVERY_HUB_CONFIG = Object.freeze({
  enabled: false,
  baseUrl: DEFAULT_BASE_URL,
  projectId: '',
  appId: DEFAULT_APP_ID,
  externalStores: [],
  emitAllOrders: false
});

const getStorage = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
};

const dispatchStateUpdate = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('deliveryHubStateUpdated'));
};

const readJson = (key, fallback) => {
  const storage = getStorage();
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`Falha ao ler ${key} do localStorage`, error);
    return fallback;
  }
};

const writeJson = (key, value) => {
  const storage = getStorage();
  if (!storage) return;

  storage.setItem(key, JSON.stringify(value));
  dispatchStateUpdate();
};

const normalizeText = (value = '') =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const sanitizeBaseUrl = (value) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  return (raw || DEFAULT_BASE_URL).replace(/\/+$/, '');
};

const sanitizeProjectId = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return '';
};

const hasProjectId = (value) => {
  if (typeof value === 'number') return Number.isFinite(value);
  return Boolean(String(value ?? '').trim());
};

const normalizeExternalStores = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const normalizeConfig = (value = {}) => ({
  enabled: Boolean(value.enabled),
  baseUrl: sanitizeBaseUrl(value.baseUrl),
  projectId: sanitizeProjectId(value.projectId),
  appId: DEFAULT_APP_ID,
  externalStores: normalizeExternalStores(value.externalStores),
  emitAllOrders: Boolean(value.emitAllOrders)
});

const getPendingEventsInternal = () => {
  const value = readJson(DELIVERY_HUB_PENDING_EVENTS_KEY, []);
  return Array.isArray(value) ? value : [];
};

const getPublishedOrdersInternal = () => {
  const value = readJson(DELIVERY_HUB_PUBLISHED_ORDERS_KEY, {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
};

const setPendingEventsInternal = (events) => {
  writeJson(DELIVERY_HUB_PENDING_EVENTS_KEY, events);
};

const setPublishedOrdersInternal = (orders) => {
  writeJson(DELIVERY_HUB_PUBLISHED_ORDERS_KEY, orders);
};

const buildQueueKey = (sourceOrderId) => `${PENDING_EVENT_NAME}:${sourceOrderId}`;

const getOperationalDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildDeliveryAddress = (address = {}) => {
  const street = String(address?.street || '').trim();
  const complement = String(address?.complement || '').trim();

  if (street && complement) return `${street} - ${complement}`;
  return street || complement || '';
};

const storeMatchesConfig = (config, payload) => {
  if (config.emitAllOrders) return true;

  const allowedStores = config.externalStores.map(normalizeText).filter(Boolean);
  if (!allowedStores.length) return false;

  const orderStores = [payload.sourceStoreName, payload.sourceBranchName]
    .map(normalizeText)
    .filter(Boolean);

  return orderStores.some((name) => allowedStores.includes(name));
};

const canPublishIncomingOrder = (config, payload) => {
  if (!config.enabled) return false;
  if (!hasProjectId(config.projectId)) return false;
  if (!payload.sourceOrderId) return false;
  return storeMatchesConfig(config, payload);
};

const buildRequestUrl = (config) =>
  `${sanitizeBaseUrl(config.baseUrl)}/projects/${encodeURIComponent(
    String(config.projectId).trim()
  )}/integration/events`;

const buildPendingEvent = ({ orderNumber, payload }) => ({
  queueKey: buildQueueKey(payload.sourceOrderId),
  event: PENDING_EVENT_NAME,
  idempotencyKey: `incoming-order:${payload.sourceOrderId}`,
  orderNumber: String(orderNumber || payload.sourceOrderId || '').trim(),
  payload,
  createdAt: new Date().toISOString(),
  lastAttemptAt: null,
  retries: 0,
  lastError: ''
});

const upsertPendingEvent = (event) => {
  const pendingEvents = getPendingEventsInternal();
  const existingIndex = pendingEvents.findIndex((item) => item.queueKey === event.queueKey);

  if (existingIndex >= 0) {
    const current = pendingEvents[existingIndex];
    pendingEvents[existingIndex] = {
      ...current,
      ...event,
      createdAt: current.createdAt || event.createdAt
    };
  } else {
    pendingEvents.push(event);
  }

  setPendingEventsInternal(pendingEvents);
  return event;
};

const removePendingEvent = (queueKey) => {
  const pendingEvents = getPendingEventsInternal();
  const filtered = pendingEvents.filter((item) => item.queueKey !== queueKey);

  if (filtered.length !== pendingEvents.length) {
    setPendingEventsInternal(filtered);
  }
};

const updatePendingEventFailure = (event, error) => {
  upsertPendingEvent({
    ...event,
    lastAttemptAt: new Date().toISOString(),
    retries: Number(event.retries || 0) + 1,
    lastError: error instanceof Error ? error.message : String(error || 'Falha ao publicar evento')
  });
};

const markPublishedOrder = (orderNumber, payload) => {
  if (!orderNumber) return;

  const publishedOrders = getPublishedOrdersInternal();
  publishedOrders[orderNumber] = {
    sourceOrderId: payload.sourceOrderId,
    publishedAt: new Date().toISOString(),
    event: PENDING_EVENT_NAME
  };

  setPublishedOrdersInternal(publishedOrders);
};

const sendEventToHub = async (event, config) => {
  const response = await fetch(buildRequestUrl(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      appId: config.appId || DEFAULT_APP_ID,
      event: event.event,
      idempotencyKey: event.idempotencyKey,
      payload: event.payload
    })
  });

  if (!response.ok) {
    let details = '';

    try {
      details = (await response.text()).trim();
    } catch (error) {
      details = '';
    }

    throw new Error(
      `Hub respondeu com ${response.status}${details ? `: ${details}` : ''}`
    );
  }

  return response;
};

export const getDeliveryHubConfig = () =>
  normalizeConfig(readJson(DELIVERY_HUB_CONFIG_KEY, DEFAULT_DELIVERY_HUB_CONFIG));

export const saveDeliveryHubConfig = (value) => {
  const normalized = normalizeConfig(value);
  writeJson(DELIVERY_HUB_CONFIG_KEY, normalized);
  return normalized;
};

export const getPendingDeliveryHubEvents = () => getPendingEventsInternal();

export const getPublishedDeliveryHubOrders = () => getPublishedOrdersInternal();

export const hasPublishedDeliveryHubOrder = (orderNumber) =>
  Boolean(getPublishedOrdersInternal()[String(orderNumber || '').trim()]);

export const buildIncomingOrderRegisteredPayload = ({ parsed, amount }) => {
  const sourceOrderId = String(parsed?.number || '').trim();
  const payload = {
    sourceOrderId,
    sourceBranchName: String(parsed?.brand || ''),
    sourceStoreName: String(parsed?.store || parsed?.brand || ''),
    customerName: String(parsed?.customer || ''),
    customerPhone: String(parsed?.contactPhone || ''),
    deliveryAddress: buildDeliveryAddress(parsed?.address),
    totalAmount: Number.isFinite(Number(amount)) ? Number(amount) : 0,
    operationalDate: getOperationalDate(new Date()),
    status: 'RECEIVED'
  };

  if (parsed?.sourceBranchId) {
    payload.sourceBranchId = String(parsed.sourceBranchId).trim();
  }

  return payload;
};

export const publishIncomingOrderRegistered = async ({ parsed, amount, isReprint = false }) => {
  const config = getDeliveryHubConfig();
  const payload = buildIncomingOrderRegisteredPayload({ parsed, amount });
  const orderNumber = payload.sourceOrderId;

  if (!orderNumber) {
    return { status: 'skipped', reason: 'missing_source_order_id' };
  }

  if (isReprint) {
    return { status: 'skipped', reason: 'reprint' };
  }

  if (hasPublishedDeliveryHubOrder(orderNumber)) {
    return { status: 'skipped', reason: 'already_published' };
  }

  if (!canPublishIncomingOrder(config, payload)) {
    return { status: 'skipped', reason: 'not_eligible' };
  }

  const pendingEvent = buildPendingEvent({ orderNumber, payload });

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    upsertPendingEvent({
      ...pendingEvent,
      lastAttemptAt: new Date().toISOString(),
      retries: 1,
      lastError: 'Sem conexao com a internet'
    });

    return { status: 'queued', reason: 'offline' };
  }

  try {
    await sendEventToHub(pendingEvent, config);
    removePendingEvent(pendingEvent.queueKey);
    markPublishedOrder(orderNumber, payload);
    return { status: 'published' };
  } catch (error) {
    updatePendingEventFailure(pendingEvent, error);
    return { status: 'queued', reason: 'publish_failed', error };
  }
};

export const flushDeliveryHubPendingEvents = async () => {
  const config = getDeliveryHubConfig();
  const pendingEvents = getPendingEventsInternal();

  if (!pendingEvents.length) {
    return { attempted: 0, published: 0, remaining: 0, reason: 'empty' };
  }

  if (!config.enabled || !hasProjectId(config.projectId)) {
    return {
      attempted: 0,
      published: 0,
      remaining: pendingEvents.length,
      reason: 'integration_not_ready'
    };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      attempted: 0,
      published: 0,
      remaining: pendingEvents.length,
      reason: 'offline'
    };
  }

  let attempted = 0;
  let published = 0;

  for (const event of pendingEvents) {
    if (!event?.orderNumber) {
      removePendingEvent(event.queueKey);
      continue;
    }

    if (hasPublishedDeliveryHubOrder(event.orderNumber)) {
      removePendingEvent(event.queueKey);
      continue;
    }

    attempted += 1;

    try {
      await sendEventToHub(event, config);
      removePendingEvent(event.queueKey);
      markPublishedOrder(event.orderNumber, event.payload || {});
      published += 1;
    } catch (error) {
      updatePendingEventFailure(event, error);
    }
  }

  return {
    attempted,
    published,
    remaining: getPendingEventsInternal().length,
    reason: published ? 'partial_or_complete_success' : 'no_success'
  };
};
