import { INITIAL_STORES } from '../../../server/lib/seed-data.js';
import { ORDER_STATUS, parseIfoodOrder, routeOrder } from '../../../server/lib/routing-core.js';

const LOCAL_DATABASE_KEY = 'easyPrintLocalDatabaseV1';
const CURRENT_STORE_KEY = 'easyPrintRoutingCurrentStoreId';
const ORDER_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;
const ORDER_LIST_LIMIT = 200;
const RESEND_WINDOW_MS = 24 * 60 * 60 * 1000;

const SETTINGS_FIELDS = [
  'keywords',
  'catalogs',
  'printTemplate',
  'cashOrders',
  'cashProcessed',
  'sentCashClearedAt',
  'deliveryBoardState',
  'finallyStorageState'
];

const LEGACY_SETTINGS_KEYS = {
  keywords: 'keywords',
  catalogs: 'catalogs',
  printTemplate: 'template',
  cashOrders: 'cashOrders',
  cashProcessed: 'cashProcessed',
  deliveryBoardState: 'deliveryBoardV2',
  finallyStorageState: 'finallyStorageAppState'
};

const nowIso = () => new Date().toISOString();

const createId = (prefix) => {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const normalizeUsername = (value) => String(value || '').trim().toLowerCase();

const normalizeAreas = (value) => (Array.isArray(value) ? value : String(value || '').split(/[,;\n]/))
  .map((item) => String(item || '').trim())
  .filter(Boolean);

const slugify = (value) => String(value || 'loja')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  || 'loja';

const createLocalError = (message, status = 400, details = {}) => {
  const error = new Error(message);
  error.status = status;
  error.payload = { error: message, ...details };
  return error;
};

const readJson = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const emptySettings = (storeId) => ({
  storeId,
  keywords: [],
  catalogs: [],
  printTemplate: {},
  cashOrders: [],
  cashProcessed: [],
  sentCashClearedAt: '',
  deliveryBoardState: {},
  finallyStorageState: {},
  operationalCleanupAt: '',
  updatedAt: nowIso()
});

const createInitialDatabase = () => {
  const timestamp = nowIso();
  const stores = INITIAL_STORES.map((store) => ({
    ...clone(store),
    username: store.id,
    password: '1234',
    createdAt: timestamp,
    updatedAt: timestamp
  }));
  const connections = [];

  stores.forEach((source) => {
    stores.forEach((target) => {
      if (source.id === target.id) return;
      connections.push({
        id: `connection-${source.id}-${target.id}`,
        sourceStoreId: source.id,
        targetStoreId: target.id,
        canSendOrders: true,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    });
  });

  return {
    version: 1,
    stores,
    connections,
    settings: {},
    orders: [],
    events: {}
  };
};

const normalizeDatabase = (candidate) => {
  const fallback = createInitialDatabase();
  if (!candidate || typeof candidate !== 'object') return fallback;

  const database = {
    version: 1,
    stores: Array.isArray(candidate.stores) ? candidate.stores : [],
    connections: Array.isArray(candidate.connections) ? candidate.connections : [],
    settings: candidate.settings && typeof candidate.settings === 'object' ? candidate.settings : {},
    orders: Array.isArray(candidate.orders) ? candidate.orders : [],
    events: candidate.events && typeof candidate.events === 'object' ? candidate.events : {}
  };

  fallback.stores.forEach((seedStore) => {
    if (!database.stores.some((store) => store.id === seedStore.id)) {
      database.stores.push(seedStore);
    }
  });

  fallback.connections.forEach((seedConnection) => {
    if (!database.connections.some((connection) => (
      connection.sourceStoreId === seedConnection.sourceStoreId
      && connection.targetStoreId === seedConnection.targetStoreId
    ))) {
      database.connections.push(seedConnection);
    }
  });

  return database;
};

const readDatabase = () => normalizeDatabase(readJson(LOCAL_DATABASE_KEY, null));

const writeDatabase = (database) => {
  try {
    window.localStorage.setItem(LOCAL_DATABASE_KEY, JSON.stringify(database));
  } catch (error) {
    throw createLocalError(
      'Nao foi possivel salvar os dados neste computador. Verifique o espaco do navegador.',
      507,
      { cause: error?.message || '' }
    );
  }
};

const toPublicStore = (store) => {
  if (!store) return null;
  const { password: _password, ...publicStore } = store;
  return clone(publicStore);
};

const getCurrentStore = (database) => {
  const storeId = window.localStorage.getItem(CURRENT_STORE_KEY) || '';
  const store = database.stores.find((candidate) => candidate.id === storeId);
  if (!store) throw createLocalError('Escolha o perfil desta loja para continuar.', 401);
  return store;
};

const readLegacySettings = (storeId) => {
  const owner = window.localStorage.getItem('easyPrintSettingsOwnerStoreId') || '';
  if (owner && owner !== storeId) return emptySettings(storeId);

  const settings = emptySettings(storeId);
  Object.entries(LEGACY_SETTINGS_KEYS).forEach(([field, key]) => {
    settings[field] = readJson(key, settings[field]);
  });
  return settings;
};

const ensureSettings = (database, storeId) => {
  if (!database.settings[storeId]) {
    database.settings[storeId] = readLegacySettings(storeId);
  }
  return database.settings[storeId];
};

const parseCashTotal = (value) => {
  const numeric = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : 0;
};

const parseCashDate = (value = '') => {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : new Date().toISOString().slice(0, 10);
};

const isEasyPrintIncomingOrder = (order = {}) => (
  String(order.hubOrderId || '').startsWith('easy-print-cash:')
  || String(order.sourceBranchId || '') === 'easy-print-cash'
);

const syncFinallyStorageWithCash = (finallyStorageState = {}, cashOrders = []) => {
  const baseState = finallyStorageState && typeof finallyStorageState === 'object'
    ? finallyStorageState
    : {};
  const currentIncoming = Array.isArray(baseState.incomingOrders) ? baseState.incomingOrders : [];
  const existingById = new Map(
    currentIncoming
      .filter(isEasyPrintIncomingOrder)
      .map((order) => [String(order.hubOrderId || ''), order])
  );
  const preserved = currentIncoming.filter((order) => !isEasyPrintIncomingOrder(order));
  const seen = new Set();
  const easyPrintIncoming = (Array.isArray(cashOrders) ? cashOrders : [])
    .filter((order) => order && !order.isReprint)
    .map((order) => {
      const orderNumber = String(order.orderNumber || order.id || '').trim();
      const hubOrderId = `easy-print-cash:${orderNumber}`;
      const existing = existingById.get(hubOrderId) || {};
      const totalAmount = Math.abs(parseCashTotal(order.total));
      const paymentMethod = String(order.paymentMethod || 'online').trim() || 'online';
      return {
        hubOrderId,
        sourceBranchId: 'easy-print-cash',
        sourceBranchName: 'Easy Print',
        paymentMethod,
        cashAmount: paymentMethod === 'dinheiro' ? totalAmount : 0,
        cardAmount: paymentMethod === 'cartao' ? totalAmount : 0,
        onlineAmount: paymentMethod === 'online' ? totalAmount : 0,
        totalAmount,
        operationalDate: parseCashDate(order.date),
        receivedAt: existing.receivedAt || nowIso()
      };
    })
    .filter((order) => {
      if (!order.hubOrderId || seen.has(order.hubOrderId)) return false;
      seen.add(order.hubOrderId);
      return true;
    });

  return { ...baseState, incomingOrders: [...preserved, ...easyPrintIncoming] };
};

const getSettingsPayload = (database, storeId) => {
  const settings = ensureSettings(database, storeId);
  settings.finallyStorageState = syncFinallyStorageWithCash(
    settings.finallyStorageState,
    settings.cashOrders
  );
  return clone(settings);
};

const getAllowedTargets = (database, sourceStoreId) => {
  const allowedIds = new Set(
    database.connections
      .filter((connection) => (
        connection.sourceStoreId === sourceStoreId
        && connection.canSendOrders !== false
      ))
      .map((connection) => connection.targetStoreId)
  );

  return database.stores
    .filter((store) => allowedIds.has(store.id) && store.receivesOrders !== false)
    .map(toPublicStore);
};

const routeForStore = (database, currentStore, rawText) => {
  const parsedData = parseIfoodOrder(rawText);
  const stores = database.stores.map(toPublicStore);
  const allowedTargets = getAllowedTargets(database, currentStore.id);
  const routeResult = routeOrder(parsedData, stores);
  const allowedIds = new Set(allowedTargets.map((store) => store.id));

  if (routeResult.suggestedStoreId && !allowedIds.has(routeResult.suggestedStoreId)) {
    return {
      parsedData,
      routeResult: {
        ...routeResult,
        suggestedStoreId: null,
        confidence: 'manual',
        requiresReview: true,
        reason: 'A loja sugerida nao esta liberada para receber pedidos desta loja.'
      },
      allowedTargets
    };
  }

  return { parsedData, routeResult, allowedTargets };
};

const addEvent = (database, orderId, type, message) => {
  const events = Array.isArray(database.events[orderId]) ? database.events[orderId] : [];
  events.push({
    id: createId('event'),
    orderId,
    type,
    message,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  database.events[orderId] = events;
};

const hydrateOrderNames = (database, order) => {
  if (!order) return null;
  const source = database.stores.find((store) => store.id === order.sourceStoreId);
  const target = database.stores.find((store) => store.id === order.targetStoreId);
  return {
    ...clone(order),
    sourceStoreName: source?.name || '',
    targetStoreName: target?.name || '',
    isResend: order.status === ORDER_STATUS.RESENT
  };
};

const requireOrder = (database, orderId) => {
  const order = database.orders.find((candidate) => candidate.id === orderId);
  if (!order) throw createLocalError('Pedido nao encontrado neste computador.', 404);
  return order;
};

const assertOrderVersion = (order, expectedVersion) => {
  const version = Number(expectedVersion);
  if (!Number.isInteger(version) || version !== Number(order.version || 1)) {
    throw createLocalError(
      'Esse pedido foi atualizado em outra janela. Recarregue a fila.',
      409,
      { code: 'ORDER_VERSION_CONFLICT' }
    );
  }
};

const updateOrder = (order, patch) => {
  Object.assign(order, patch, {
    version: Number(order.version || 1) + 1,
    updatedAt: nowIso()
  });
};

const listOrders = (kind, options = {}) => {
  const database = readDatabase();
  const currentStore = getCurrentStore(database);
  const cutoff = Date.now() - ORDER_RETENTION_MS;
  const beforePurge = database.orders.length;
  database.orders = database.orders.filter((order) => {
    const createdAt = new Date(order.createdAt || '').getTime();
    return !Number.isFinite(createdAt) || createdAt >= cutoff;
  });
  if (database.orders.length !== beforePurge) writeDatabase(database);

  const updatedAfter = new Date(String(options.updatedAfter || '')).getTime();
  const incremental = Number.isFinite(updatedAfter);
  const orders = database.orders
    .filter((order) => (
      kind === 'received'
        ? order.targetStoreId === currentStore.id
        : order.sourceStoreId === currentStore.id
    ))
    .filter((order) => kind !== 'received' || incremental || order.status !== ORDER_STATUS.CANCELED)
    .filter((order) => {
      if (!incremental) return true;
      return new Date(order.updatedAt || order.createdAt || '').getTime() > updatedAfter;
    })
    .sort((left, right) => (
      new Date(right.createdAt || '').getTime() - new Date(left.createdAt || '').getTime()
    ))
    .slice(0, ORDER_LIST_LIMIT)
    .map((order) => hydrateOrderNames(database, order));

  return { orders, incremental, cursor: nowIso(), localOnly: true };
};

const mutateOrder = (orderId, expectedVersion, action) => {
  const database = readDatabase();
  const currentStore = getCurrentStore(database);
  const order = requireOrder(database, orderId);
  if (order.sourceStoreId !== currentStore.id && order.targetStoreId !== currentStore.id) {
    throw createLocalError('Esta loja nao tem acesso a esse pedido local.', 403);
  }
  assertOrderVersion(order, expectedVersion);
  action(database, order);
  writeDatabase(database);
  return { order: hydrateOrderNames(database, order), localOnly: true };
};

export const localRoutingApi = {
  listSetupStores: async () => {
    const database = readDatabase();
    return { stores: database.stores.map(toPublicStore), localOnly: true };
  },

  createSetupStore: async (input = {}) => {
    const database = readDatabase();
    const username = normalizeUsername(input.username);
    if (!username) throw createLocalError('Informe o usuario da loja.');
    if (database.stores.some((store) => normalizeUsername(store.username) === username)) {
      throw createLocalError('Esse usuario ja existe neste computador.', 409);
    }

    const baseId = slugify(input.name || username);
    let id = baseId;
    let suffix = 2;
    while (database.stores.some((store) => store.id === id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

    const timestamp = nowIso();
    const store = {
      id,
      name: String(input.name || 'Minha loja').trim() || 'Minha loja',
      city: String(input.city || '').trim(),
      serviceAreas: [],
      reviewAreas: [],
      receivesOrders: true,
      autoPrint: false,
      username,
      password: String(input.password || '1234'),
      createdAt: timestamp,
      updatedAt: timestamp
    };

    database.stores.forEach((existingStore) => {
      database.connections.push(
        {
          id: createId('connection'),
          sourceStoreId: store.id,
          targetStoreId: existingStore.id,
          canSendOrders: true,
          createdAt: timestamp,
          updatedAt: timestamp
        },
        {
          id: createId('connection'),
          sourceStoreId: existingStore.id,
          targetStoreId: store.id,
          canSendOrders: true,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      );
    });
    database.stores.push(store);
    database.settings[store.id] = emptySettings(store.id);
    writeDatabase(database);
    return { store: toPublicStore(store), localOnly: true };
  },

  login: async (input = {}) => {
    const database = readDatabase();
    const username = normalizeUsername(input.username);
    const store = database.stores.find((candidate) => (
      normalizeUsername(candidate.username || candidate.id) === username
    ));
    if (!store || String(store.password || '1234') !== String(input.password || '')) {
      throw createLocalError('Usuario ou senha da loja invalidos neste computador.', 401);
    }
    return {
      token: `local:${store.id}`,
      store: toPublicStore(store),
      localOnly: true
    };
  },

  logout: async () => ({ ok: true, localOnly: true }),

  getMe: async () => {
    const database = readDatabase();
    const currentStore = getCurrentStore(database);
    return {
      store: toPublicStore(currentStore),
      stores: database.stores.map(toPublicStore),
      connections: database.connections
        .filter((connection) => connection.sourceStoreId === currentStore.id)
        .map(clone),
      allowedTargets: getAllowedTargets(database, currentStore.id),
      localOnly: true
    };
  },

  getSettings: async () => {
    const database = readDatabase();
    const currentStore = getCurrentStore(database);
    const settings = getSettingsPayload(database, currentStore.id);
    writeDatabase(database);
    return { settings, localOnly: true };
  },

  saveSettings: async (input = {}) => {
    const database = readDatabase();
    const currentStore = getCurrentStore(database);
    const current = ensureSettings(database, currentStore.id);
    const updatedAt = nowIso();
    const settingsPatch = { storeId: currentStore.id, updatedAt, operationalCleanupAt: '' };

    SETTINGS_FIELDS.forEach((field) => {
      if (input[field] === undefined) return;
      current[field] = clone(input[field]);
      settingsPatch[field] = clone(input[field]);
    });

    if (input.cashOrders !== undefined || input.finallyStorageState !== undefined) {
      current.finallyStorageState = syncFinallyStorageWithCash(
        current.finallyStorageState,
        current.cashOrders
      );
      settingsPatch.finallyStorageState = clone(current.finallyStorageState);
    }

    current.updatedAt = updatedAt;
    current.operationalCleanupAt = '';
    database.settings[currentStore.id] = current;
    writeDatabase(database);
    return { settings: settingsPatch, localOnly: true };
  },

  saveMyStore: async (input = {}) => {
    const database = readDatabase();
    const store = getCurrentStore(database);
    if (input.username !== undefined) {
      const username = normalizeUsername(input.username);
      const duplicate = database.stores.some((candidate) => (
        candidate.id !== store.id && normalizeUsername(candidate.username) === username
      ));
      if (duplicate) throw createLocalError('Esse usuario ja existe neste computador.', 409);
      if (username) store.username = username;
    }
    if (input.password) store.password = String(input.password);
    if (input.name !== undefined) store.name = String(input.name || '').trim() || 'Loja sem nome';
    if (input.city !== undefined) store.city = String(input.city || '').trim();
    if (input.serviceAreas !== undefined) store.serviceAreas = normalizeAreas(input.serviceAreas);
    if (input.reviewAreas !== undefined) store.reviewAreas = normalizeAreas(input.reviewAreas);
    if (input.receivesOrders !== undefined) store.receivesOrders = Boolean(input.receivesOrders);
    if (input.autoPrint !== undefined) store.autoPrint = Boolean(input.autoPrint);
    store.updatedAt = nowIso();
    writeDatabase(database);
    return { store: toPublicStore(store), localOnly: true };
  },

  setConnection: async (targetStoreId, canSendOrders) => {
    const database = readDatabase();
    const currentStore = getCurrentStore(database);
    if (!database.stores.some((store) => store.id === targetStoreId)) {
      throw createLocalError('Loja destino nao encontrada neste computador.', 404);
    }
    let connection = database.connections.find((candidate) => (
      candidate.sourceStoreId === currentStore.id
      && candidate.targetStoreId === targetStoreId
    ));
    if (!connection) {
      connection = {
        id: createId('connection'),
        sourceStoreId: currentStore.id,
        targetStoreId,
        createdAt: nowIso()
      };
      database.connections.push(connection);
    }
    connection.canSendOrders = Boolean(canSendOrders);
    connection.updatedAt = nowIso();
    writeDatabase(database);
    return {
      connection: clone(connection),
      allowedTargets: getAllowedTargets(database, currentStore.id),
      localOnly: true
    };
  },

  parseRoute: async (rawText) => {
    const database = readDatabase();
    const currentStore = getCurrentStore(database);
    return { ...routeForStore(database, currentStore, String(rawText || '')), localOnly: true };
  },

  createOrder: async ({ rawText, targetStoreId, routeConfirmed }) => {
    const database = readDatabase();
    const currentStore = getCurrentStore(database);
    const target = database.stores.find((store) => store.id === targetStoreId);
    const canSend = database.connections.some((connection) => (
      connection.sourceStoreId === currentStore.id
      && connection.targetStoreId === targetStoreId
      && connection.canSendOrders !== false
    ));
    if (!target || target.receivesOrders === false || !canSend) {
      throw createLocalError('Esta loja nao esta liberada para receber pedidos.', 403);
    }

    const route = routeForStore(database, currentStore, String(rawText || '').trim());
    if (route.routeResult.requiresReview && !routeConfirmed) {
      throw createLocalError('Confira a regiao antes de enviar esse pedido.', 409, {
        requiresReview: true,
        routeResult: route.routeResult,
        parsedData: route.parsedData
      });
    }

    const timestamp = nowIso();
    const orderNumber = String(
      route.parsedData?.orderNumber || route.parsedData?.locator || ''
    ).trim();
    const recent = database.orders.find((order) => (
      order.sourceStoreId === currentStore.id
      && order.targetStoreId === targetStoreId
      && order.orderNumber === orderNumber
      && Date.now() - new Date(order.createdAt || '').getTime() <= RESEND_WINDOW_MS
    ));

    let order;
    let duplicate = false;
    if (recent && orderNumber) {
      order = recent;
      duplicate = true;
      updateOrder(order, {
        orderNumber,
        customerName: String(route.parsedData?.customerName || ''),
        rawText: String(rawText || '').trim(),
        parsedData: route.parsedData,
        routeResult: route.routeResult,
        status: ORDER_STATUS.RESENT,
        createdAt: timestamp,
        viewedAt: '',
        printedAt: '',
        canceledAt: ''
      });
      addEvent(database, order.id, ORDER_STATUS.RESENT, 'Pedido reenviado na fila local.');
    } else {
      order = {
        id: createId('order'),
        orderNumber,
        customerName: String(route.parsedData?.customerName || ''),
        sourceStoreId: currentStore.id,
        targetStoreId,
        rawText: String(rawText || '').trim(),
        parsedData: route.parsedData,
        routeResult: route.routeResult,
        status: ORDER_STATUS.SENT,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        viewedAt: '',
        printedAt: '',
        canceledAt: ''
      };
      database.orders.push(order);
      addEvent(database, order.id, ORDER_STATUS.SENT, 'Pedido salvo na fila local deste computador.');
    }

    writeDatabase(database);
    return {
      order: hydrateOrderNames(database, order),
      duplicate,
      message: duplicate
        ? 'Pedido reenviado na fila local. O caixa mantem apenas uma entrada.'
        : 'Pedido salvo neste computador. Sem servidor, ele nao e enviado para outras maquinas.',
      localOnly: true
    };
  },

  listReceivedOrders: async (options) => listOrders('received', options),
  listSentOrders: async (options) => listOrders('sent', options),

  getOrder: async (orderId) => {
    const database = readDatabase();
    const currentStore = getCurrentStore(database);
    const order = requireOrder(database, orderId);
    if (order.sourceStoreId !== currentStore.id && order.targetStoreId !== currentStore.id) {
      throw createLocalError('Esta loja nao tem acesso a esse pedido local.', 403);
    }
    return {
      order: hydrateOrderNames(database, order),
      events: clone(database.events[orderId] || []),
      localOnly: true
    };
  },

  addOrderEvent: async (orderId, body = {}) => {
    const database = readDatabase();
    requireOrder(database, orderId);
    addEvent(database, orderId, String(body.type || ''), String(body.message || ''));
    writeDatabase(database);
    return { events: clone(database.events[orderId] || []), localOnly: true };
  },

  updateOrderStatus: async (orderId, status, version) => {
    if (status === ORDER_STATUS.VIEWED) return localRoutingApi.markViewed(orderId, version);
    if (status === ORDER_STATUS.PRINTED) return localRoutingApi.markPrinted(orderId, version);
    if (status === ORDER_STATUS.CANCELED) return localRoutingApi.cancelOrder(orderId, version);
    throw createLocalError('Status de pedido invalido.', 400);
  },

  markViewed: async (orderId, version) => mutateOrder(orderId, version, (database, order) => {
    if (order.status === ORDER_STATUS.SENT) {
      updateOrder(order, { status: ORDER_STATUS.VIEWED, viewedAt: order.viewedAt || nowIso() });
      addEvent(database, order.id, ORDER_STATUS.VIEWED, 'Pedido aberto localmente.');
    }
  }),

  markPrinted: async (orderId, version) => mutateOrder(orderId, version, (database, order) => {
    updateOrder(order, { status: ORDER_STATUS.PRINTED, printedAt: nowIso() });
    addEvent(database, order.id, ORDER_STATUS.PRINTED, 'Pedido marcado como impresso localmente.');
  }),

  cancelOrder: async (orderId, version) => mutateOrder(orderId, version, (database, order) => {
    updateOrder(order, { status: ORDER_STATUS.CANCELED, canceledAt: nowIso() });
    addEvent(database, order.id, ORDER_STATUS.CANCELED, 'Pedido removido da fila local.');
  })
};

export const resetLocalRoutingDatabaseForTests = () => {
  window.localStorage.removeItem(LOCAL_DATABASE_KEY);
};
