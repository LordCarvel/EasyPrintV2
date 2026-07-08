const DELIVERY_HUB_CONFIG_KEY = 'deliveryBoardHubConfig';
const DELIVERY_HUB_PENDING_EVENTS_KEY = 'deliveryBoardHubPendingEvents';
const DELIVERY_HUB_SHARED_ORDERS_CACHE_KEY = 'deliveryBoardHubSharedOrdersCache';
const DELIVERY_HUB_COMMANDS_CACHE_KEY = 'deliveryBoardHubCommandsCache';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8080';
const DEFAULT_APP_ID = 'delivery-board';
const DISPATCHABLE_SHARED_ORDER_STATUSES = new Set(['RECEIVED', 'READY_FOR_DISPATCH']);

export const DEFAULT_DELIVERY_HUB_CONFIG = Object.freeze({
  enabled: false,
  baseUrl: DEFAULT_BASE_URL,
  projectId: '',
  appId: DEFAULT_APP_ID,
  pollIntervalSeconds: 20,
});

const getStorage = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
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
};

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

const normalizeOrderRef = (value = '') =>
  String(value ?? '')
    .trim()
    .replace(/^#/, '')
    .toLowerCase();

const normalizeConfig = (value = {}) => ({
  enabled: Boolean(value.enabled),
  baseUrl: sanitizeBaseUrl(value.baseUrl),
  projectId: sanitizeProjectId(value.projectId),
  appId: DEFAULT_APP_ID,
  pollIntervalSeconds: Math.max(
    5,
    Math.round(Number.parseInt(String(value.pollIntervalSeconds ?? DEFAULT_DELIVERY_HUB_CONFIG.pollIntervalSeconds), 10) || DEFAULT_DELIVERY_HUB_CONFIG.pollIntervalSeconds)
  ),
});

const normalizeSharedOrder = (value = {}) => ({
  hubOrderId: String(value.hubOrderId || '').trim(),
  sourceApp: String(value.sourceApp || '').trim(),
  sourceProjectId: value.sourceProjectId ?? null,
  sourceOrderId: String(value.sourceOrderId || '').trim(),
  sourceBranchId: String(value.sourceBranchId || '').trim(),
  sourceBranchName: String(value.sourceBranchName || '').trim(),
  sourceStoreName: String(value.sourceStoreName || '').trim(),
  customerName: String(value.customerName || '').trim(),
  customerPhone: String(value.customerPhone || '').trim(),
  deliveryAddress: String(value.deliveryAddress || '').trim(),
  totalAmount: Number(value.totalAmount || 0),
  operationalDate: String(value.operationalDate || '').trim(),
  status: String(value.status || '').trim(),
  currentRunHubId: String(value.currentRunHubId || '').trim(),
  createdAt: String(value.createdAt || '').trim(),
  updatedAt: String(value.updatedAt || '').trim(),
});

const normalizeCommand = (value = {}) => ({
  id: value.id,
  targetAppId: String(value.targetAppId || '').trim(),
  command: String(value.command || '').trim(),
  status: String(value.status || '').trim(),
  payload: value.payload && typeof value.payload === 'object' ? value.payload : {},
  sourceEventKey: String(value.sourceEventKey || '').trim(),
  createdAt: String(value.createdAt || '').trim(),
  acknowledgedAt: String(value.acknowledgedAt || '').trim(),
});

const normalizePendingEvent = (value = {}) => ({
  queueKey: String(value.queueKey || '').trim(),
  event: String(value.event || '').trim(),
  idempotencyKey: String(value.idempotencyKey || '').trim(),
  sourceRunId: String(value.sourceRunId || '').trim(),
  payload: value.payload && typeof value.payload === 'object' ? value.payload : {},
  createdAt: String(value.createdAt || '').trim(),
  lastAttemptAt: String(value.lastAttemptAt || '').trim(),
  retries: Number(value.retries || 0),
  lastError: String(value.lastError || '').trim(),
});

const getPendingEventsInternal = () => {
  const value = readJson(DELIVERY_HUB_PENDING_EVENTS_KEY, []);
  return Array.isArray(value) ? value.map(normalizePendingEvent).filter((item) => item.queueKey) : [];
};

const setPendingEventsInternal = (events) => {
  writeJson(
    DELIVERY_HUB_PENDING_EVENTS_KEY,
    Array.isArray(events) ? events.map(normalizePendingEvent) : []
  );
};

const setSharedOrdersCache = (orders) => {
  writeJson(
    DELIVERY_HUB_SHARED_ORDERS_CACHE_KEY,
    Array.isArray(orders) ? orders.map(normalizeSharedOrder) : []
  );
};

const setCommandsCache = (commands) => {
  writeJson(
    DELIVERY_HUB_COMMANDS_CACHE_KEY,
    Array.isArray(commands) ? commands.map(normalizeCommand) : []
  );
};

export const getOperationalDate = (dateValue = new Date()) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    const fallback = new Date();
    return `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, '0')}-${String(fallback.getDate()).padStart(2, '0')}`;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildProjectUrl = (config, suffix) =>
  `${sanitizeBaseUrl(config.baseUrl)}/projects/${encodeURIComponent(String(config.projectId).trim())}${suffix}`;

const buildIntegrationUrl = (config, suffix) => `${sanitizeBaseUrl(config.baseUrl)}${suffix}`;

const parseResponseError = async (response) => {
  try {
    const text = (await response.text()).trim();
    return text ? `${response.status}: ${text}` : String(response.status);
  } catch {
    return String(response.status);
  }
};

const sendHubEvent = async (config, event) => {
  const response = await fetch(buildProjectUrl(config, '/integration/events'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      appId: config.appId || DEFAULT_APP_ID,
      event: event.event,
      idempotencyKey: event.idempotencyKey,
      payload: event.payload,
    }),
  });

  if (!response.ok) {
    throw new Error(`Hub respondeu com ${await parseResponseError(response)}`);
  }

  return response.json().catch(() => null);
};

const fetchSharedOrders = async (config) => {
  const response = await fetch(buildIntegrationUrl(config, '/integration/shared-orders'));

  if (!response.ok) {
    throw new Error(`Falha ao buscar pedidos compartilhados: ${await parseResponseError(response)}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data.map(normalizeSharedOrder) : [];
};

const fetchPendingCommands = async (config) => {
  const response = await fetch(buildProjectUrl(config, '/integration/commands'));

  if (!response.ok) {
    throw new Error(`Falha ao buscar comandos pendentes: ${await parseResponseError(response)}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data.map(normalizeCommand) : [];
};

const buildQueueKey = (eventName, sourceRunId) => `${eventName}:${sourceRunId}`;

const upsertPendingEvent = (event) => {
  const current = getPendingEventsInternal();
  const index = current.findIndex((item) => item.queueKey === event.queueKey);

  if (index >= 0) {
    current[index] = {
      ...current[index],
      ...normalizePendingEvent(event),
      createdAt: current[index].createdAt || event.createdAt,
    };
  } else {
    current.push(normalizePendingEvent(event));
  }

  setPendingEventsInternal(current);
  return event;
};

const removePendingEvent = (queueKey) => {
  const current = getPendingEventsInternal();
  const next = current.filter((item) => item.queueKey !== queueKey);

  if (next.length !== current.length) {
    setPendingEventsInternal(next);
  }
};

export const getDeliveryHubConfig = () =>
  normalizeConfig(readJson(DELIVERY_HUB_CONFIG_KEY, DEFAULT_DELIVERY_HUB_CONFIG));

export const saveDeliveryHubConfig = (value) => {
  const normalized = normalizeConfig(value);
  writeJson(DELIVERY_HUB_CONFIG_KEY, normalized);
  return normalized;
};

export const getCachedSharedOrders = () => {
  const value = readJson(DELIVERY_HUB_SHARED_ORDERS_CACHE_KEY, []);
  return Array.isArray(value) ? value.map(normalizeSharedOrder) : [];
};

export const getCachedHubCommands = () => {
  const value = readJson(DELIVERY_HUB_COMMANDS_CACHE_KEY, []);
  return Array.isArray(value) ? value.map(normalizeCommand) : [];
};

export const getPendingHubEvents = () => getPendingEventsInternal();

export const isSharedOrderDispatchable = (sharedOrder) =>
  DISPATCHABLE_SHARED_ORDER_STATUSES.has(String(sharedOrder?.status || '').trim().toUpperCase());

export const findMatchingSharedOrder = (sharedOrders = [], entregaOrOrderNumber) => {
  const orderNumber = typeof entregaOrOrderNumber === 'object'
    ? entregaOrOrderNumber?.numeroPedido
    : entregaOrOrderNumber;
  const hubOrderId = typeof entregaOrOrderNumber === 'object'
    ? entregaOrOrderNumber?.hubOrderId
    : '';

  const normalizedOrder = normalizeOrderRef(orderNumber);
  const normalizedHubId = normalizeOrderRef(hubOrderId);

  return sharedOrders.find((item) => {
    const sourceMatch = normalizedOrder && normalizeOrderRef(item.sourceOrderId) === normalizedOrder;
    const hubMatch = normalizedHubId && normalizeOrderRef(item.hubOrderId) === normalizedHubId;
    return sourceMatch || hubMatch;
  }) || null;
};

export const buildEntregaHubFields = (sharedOrder) => {
  if (!sharedOrder) {
    return {
      hubOrderId: null,
      sourceApp: null,
      sourceBranchId: null,
      sourceBranchName: null,
      sourceStoreName: null,
      externalOrigin: false,
    };
  }

  return {
    hubOrderId: sharedOrder.hubOrderId || null,
    sourceApp: sharedOrder.sourceApp || null,
    sourceBranchId: sharedOrder.sourceBranchId || null,
    sourceBranchName: sharedOrder.sourceBranchName || null,
    sourceStoreName: sharedOrder.sourceStoreName || null,
    externalOrigin: true,
  };
};

const buildFallbackSharedOrderFromEntrega = (entrega) => {
  const hubOrderId = String(entrega?.hubOrderId || '').trim();
  const sourceOrderId = String(entrega?.numeroPedido || '').trim();
  const sourceApp = String(entrega?.sourceApp || '').trim();
  const sourceBranchId = String(entrega?.sourceBranchId || '').trim();
  const sourceBranchName = String(entrega?.sourceBranchName || '').trim();
  const sourceStoreName = String(entrega?.sourceStoreName || '').trim();
  const externalOrigin = Boolean(
    entrega?.externalOrigin
    || hubOrderId
    || sourceApp
    || sourceBranchId
    || sourceBranchName
    || sourceStoreName
  );

  if (!externalOrigin || (!hubOrderId && !sourceOrderId)) {
    return null;
  }

  return {
    hubOrderId,
    sourceApp,
    sourceOrderId,
    sourceBranchId,
    sourceBranchName,
    sourceStoreName,
    status: 'RECEIVED',
  };
};

export const reconcileEntregasWithSharedOrders = (entregas = [], sharedOrders = []) => {
  let changed = false;

  const nextEntregas = entregas.map((entrega) => {
    const sharedOrder = findMatchingSharedOrder(sharedOrders, entrega);
    const nextFields = buildEntregaHubFields(sharedOrder);
    const sameFields = (
      (entrega.hubOrderId || null) === nextFields.hubOrderId
      && (entrega.sourceApp || null) === nextFields.sourceApp
      && (entrega.sourceBranchId || null) === nextFields.sourceBranchId
      && (entrega.sourceBranchName || null) === nextFields.sourceBranchName
      && (entrega.sourceStoreName || null) === nextFields.sourceStoreName
      && Boolean(entrega.externalOrigin) === nextFields.externalOrigin
    );

    if (sameFields) {
      return entrega;
    }

    changed = true;
    return {
      ...entrega,
      ...nextFields,
    };
  });

  return changed ? nextEntregas : entregas;
};

export const buildDeliveryRunSourceRunId = (viagem) => {
  const nextSequence = Math.max(0, Number(viagem?.hubDispatchSequence || 0)) + 1;
  return {
    sourceRunId: `${String(viagem?.id || 'run').trim()}:dispatch:${nextSequence}`,
    nextSequence,
  };
};

export const buildDispatchEventPayload = ({ viagem, motoboy, entregas = [], sharedOrders = [] }) => {
  if (!viagem || !motoboy) return null;

  const matchedOrders = entregas
    .map((entrega, index) => {
      const snapshotSharedOrder = findMatchingSharedOrder(sharedOrders, entrega);
      const sharedOrder = snapshotSharedOrder || buildFallbackSharedOrderFromEntrega(entrega);

      if (!sharedOrder) {
        return null;
      }

      if (snapshotSharedOrder && !isSharedOrderDispatchable(snapshotSharedOrder)) {
        return null;
      }

      return {
        entrega,
        sharedOrder,
        deliverySequence: index + 1,
      };
    })
    .filter(Boolean);

  if (!matchedOrders.length) {
    return null;
  }

  const { sourceRunId, nextSequence } = buildDeliveryRunSourceRunId(viagem);
  const operationalDate = getOperationalDate(viagem.dataHoraSaida || new Date());

  return {
    sourceRunId,
    nextSequence,
    payload: {
      sourceRunId,
      courierId: String(motoboy.id || '').trim(),
      courierName: String(motoboy.nome || '').trim(),
      operationalDate,
      dispatchedAt: new Date().toISOString(),
      orders: matchedOrders.map(({ sharedOrder, deliverySequence }) => ({
        hubOrderId: sharedOrder.hubOrderId,
        sourceOrderId: sharedOrder.sourceOrderId,
        deliverySequence,
      })),
    },
  };
};

const resolveDispatchEventPayload = async (config, params = {}) => {
  const normalizedConfig = normalizeConfig(config);
  const cachedSharedOrders = Array.isArray(params.sharedOrders) ? params.sharedOrders : [];
  const cachedBuilt = buildDispatchEventPayload({
    ...params,
    sharedOrders: cachedSharedOrders,
  });

  if (cachedBuilt) {
    return { built: cachedBuilt, refreshError: '' };
  }

  if (!normalizedConfig.enabled || !hasProjectId(normalizedConfig.projectId)) {
    return { built: null, refreshError: '' };
  }

  try {
    const freshSharedOrders = await fetchSharedOrders(normalizedConfig);
    setSharedOrdersCache(freshSharedOrders);
    return {
      built: buildDispatchEventPayload({
        ...params,
        sharedOrders: freshSharedOrders,
      }),
      refreshError: '',
    };
  } catch (error) {
    return {
      built: null,
      refreshError: error instanceof Error
        ? error.message
        : 'Falha ao atualizar pedidos do hub antes de publicar a viagem.',
    };
  }
};

export const buildRevertEventPayload = ({ sourceRunId, operationalDate }) => {
  if (!String(sourceRunId || '').trim()) return null;

  return {
    sourceRunId: String(sourceRunId).trim(),
    payload: {
      sourceRunId: String(sourceRunId).trim(),
      operationalDate: String(operationalDate || getOperationalDate(new Date())).trim(),
    },
  };
};

export const publishDeliveryHubEvent = async (config, event) => {
  const normalizedConfig = normalizeConfig(config);

  if (!normalizedConfig.enabled || !hasProjectId(normalizedConfig.projectId)) {
    return { status: 'skipped', reason: 'integration_not_ready' };
  }

  if (!event?.event || !event?.sourceRunId) {
    return { status: 'skipped', reason: 'invalid_event' };
  }

  const pendingEvent = normalizePendingEvent({
    queueKey: buildQueueKey(event.event, event.sourceRunId),
    event: event.event,
    idempotencyKey: event.idempotencyKey,
    sourceRunId: event.sourceRunId,
    payload: event.payload,
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    retries: 0,
    lastError: '',
  });

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    upsertPendingEvent({
      ...pendingEvent,
      lastAttemptAt: new Date().toISOString(),
      retries: 1,
      lastError: 'Sem conexao com a internet',
    });
    return { status: 'queued', reason: 'offline', sourceRunId: event.sourceRunId };
  }

  try {
    await sendHubEvent(normalizedConfig, pendingEvent);
    removePendingEvent(pendingEvent.queueKey);
    return { status: 'published', sourceRunId: event.sourceRunId };
  } catch (error) {
    upsertPendingEvent({
      ...pendingEvent,
      lastAttemptAt: new Date().toISOString(),
      retries: 1,
      lastError: error instanceof Error ? error.message : String(error || 'Falha ao publicar evento'),
    });
    return {
      status: 'queued',
      reason: 'publish_failed',
      error,
      sourceRunId: event.sourceRunId,
    };
  }
};

export const publishDeliveryRunDispatched = async (config, params) => {
  const { built, refreshError } = await resolveDispatchEventPayload(config, params);
  if (!built) {
    return { status: 'skipped', reason: 'no_hub_orders', refreshError };
  }

  return publishDeliveryHubEvent(config, {
    event: 'delivery_run_dispatched',
    idempotencyKey: `run:${built.sourceRunId}`,
    sourceRunId: built.sourceRunId,
    payload: built.payload,
  }).then((result) => ({
    ...result,
    nextSequence: built.nextSequence,
    matchedOrdersCount: built.payload.orders.length,
    refreshError,
  }));
};

export const publishDeliveryRunReverted = async (config, params) => {
  const built = buildRevertEventPayload(params);
  if (!built) {
    return { status: 'skipped', reason: 'missing_source_run_id' };
  }

  return publishDeliveryHubEvent(config, {
    event: 'delivery_run_reverted',
    idempotencyKey: `run-revert:${built.sourceRunId}`,
    sourceRunId: built.sourceRunId,
    payload: built.payload,
  });
};

export const flushDeliveryHubPendingEvents = async (config) => {
  const normalizedConfig = normalizeConfig(config);
  const pendingEvents = getPendingEventsInternal();

  if (!pendingEvents.length) {
    return { attempted: 0, published: 0, remaining: 0, reason: 'empty' };
  }

  if (!normalizedConfig.enabled || !hasProjectId(normalizedConfig.projectId)) {
    return { attempted: 0, published: 0, remaining: pendingEvents.length, reason: 'integration_not_ready' };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { attempted: 0, published: 0, remaining: pendingEvents.length, reason: 'offline' };
  }

  let attempted = 0;
  let published = 0;

  for (const event of pendingEvents) {
    attempted += 1;

    try {
      await sendHubEvent(normalizedConfig, event);
      removePendingEvent(event.queueKey);
      published += 1;
    } catch (error) {
      upsertPendingEvent({
        ...event,
        lastAttemptAt: new Date().toISOString(),
        retries: Number(event.retries || 0) + 1,
        lastError: error instanceof Error ? error.message : String(error || 'Falha ao publicar evento'),
      });
    }
  }

  return {
    attempted,
    published,
    remaining: getPendingEventsInternal().length,
    reason: published ? 'partial_or_complete_success' : 'no_success',
  };
};

export const syncDeliveryHubState = async (config) => {
  const normalizedConfig = normalizeConfig(config);

  if (!normalizedConfig.enabled || !hasProjectId(normalizedConfig.projectId)) {
    return {
      sharedOrders: getCachedSharedOrders(),
      commands: getCachedHubCommands(),
      reason: 'integration_not_ready',
    };
  }

  const [sharedOrdersResult, commandsResult] = await Promise.all([
    fetchSharedOrders(normalizedConfig)
      .then((data) => ({ data, errorMessage: '' }))
      .catch((error) => ({
        data: getCachedSharedOrders(),
        errorMessage: error instanceof Error ? error.message : 'Falha ao buscar pedidos compartilhados.',
      })),
    fetchPendingCommands(normalizedConfig)
      .then((data) => ({ data, errorMessage: '' }))
      .catch((error) => ({
        data: getCachedHubCommands(),
        errorMessage: error instanceof Error ? error.message : 'Falha ao buscar comandos pendentes.',
      })),
  ]);

  const sharedOrders = sharedOrdersResult.data;
  const commands = commandsResult.data;
  const errorMessage = [sharedOrdersResult.errorMessage, commandsResult.errorMessage]
    .filter(Boolean)
    .join(' | ');

  setSharedOrdersCache(sharedOrders);
  setCommandsCache(commands);

  return {
    sharedOrders,
    commands,
    reason: errorMessage ? 'partial_sync' : 'synced',
    errorMessage,
  };
};

export const acknowledgeHubCommand = async (config, commandId) => {
  const normalizedConfig = normalizeConfig(config);
  const response = await fetch(
    buildProjectUrl(normalizedConfig, `/integration/commands/${commandId}/ack`),
    { method: 'POST' }
  );

  if (!response.ok) {
    throw new Error(`Falha ao confirmar comando: ${await parseResponseError(response)}`);
  }

  return response.json().catch(() => null);
};

export const buildWhatsappCommandUrl = (command) => {
  const payload = command?.payload || {};
  const rawNumber = String(payload.destinationWhatsappNumber || '').replace(/\D/g, '');
  const messageText = String(payload.messageText || '').trim();

  if (!rawNumber || !messageText) {
    return '';
  }

  return `https://wa.me/${rawNumber}?text=${encodeURIComponent(messageText)}`;
};
