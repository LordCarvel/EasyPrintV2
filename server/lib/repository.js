import { ORDER_STATUS } from './routing-core.js';
import { createId, decodeJson, encodeJson, nowIso } from './database.js';
import { INITIAL_STORES } from './seed-data.js';
import { createPasswordHash, createSessionToken, normalizeUsername, verifyPassword } from './auth.js';

const RESEND_WINDOW_MS = 24 * 60 * 60 * 1000;
const ORDER_VERSION_CONFLICT_MESSAGE = 'Esse pedido foi atualizado em outra maquina. Recarregue a fila.';

const createOrderConflictError = (order = null) => {
  const error = new Error(ORDER_VERSION_CONFLICT_MESSAGE);
  error.statusCode = 409;
  error.code = 'ORDER_VERSION_CONFLICT';
  error.order = order;
  return error;
};

const normalizeExpectedVersion = (value) => {
  const version = Number(value);
  return Number.isInteger(version) && version > 0 ? version : null;
};

const assertOrderVersion = (order, expectedVersion) => {
  const version = normalizeExpectedVersion(expectedVersion);
  if (!order || version === null || order.version !== version) {
    throw createOrderConflictError(order);
  }
};

const rowToStore = (row) => row && ({
  id: row.id,
  name: row.name,
  city: row.city,
  serviceAreas: decodeJson(row.service_areas, []),
  reviewAreas: decodeJson(row.review_areas, []),
  receivesOrders: Boolean(row.receives_orders),
  autoPrint: Boolean(row.auto_print),
  username: row.username || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const rowToConnection = (row) => row && ({
  id: row.id,
  sourceStoreId: row.source_store_id,
  targetStoreId: row.target_store_id,
  canSendOrders: Boolean(row.can_send_orders),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const rowToOrder = (row) => row && ({
  id: row.id,
  orderNumber: row.order_number,
  customerName: row.customer_name,
  sourceStoreId: row.source_store_id,
  targetStoreId: row.target_store_id,
  rawText: row.raw_text,
  parsedData: decodeJson(row.parsed_data, {}),
  routeResult: decodeJson(row.route_result, {}),
  status: row.status,
  version: Number(row.version || 1),
  createdAt: row.created_at,
  updatedAt: row.updated_at || row.created_at,
  viewedAt: row.viewed_at || '',
  printedAt: row.printed_at || '',
  canceledAt: row.canceled_at || '',
  sourceStoreName: row.source_store_name || '',
  targetStoreName: row.target_store_name || '',
  isResend: row.status === ORDER_STATUS.RESENT
});

const getOrderNumberForDedupe = (input = {}) =>
  String(input.parsedData?.orderNumber || input.parsedData?.locator || '').trim();

const isWithinResendWindow = (value) => {
  const timestamp = new Date(value || '').getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= RESEND_WINDOW_MS;
};

const findRecentOrderForResend = (db, input) => {
  const orderNumber = getOrderNumberForDedupe(input);
  if (!orderNumber) return null;

  return db.prepare(`
    SELECT id, created_at
    FROM orders
    WHERE source_store_id = ?
      AND target_store_id = ?
      AND order_number = ?
    ORDER BY created_at DESC
    LIMIT 5
  `)
    .all(input.sourceStoreId, input.targetStoreId, orderNumber)
    .find((row) => isWithinResendWindow(row.created_at)) || null;
};

const EASY_PRINT_CASH_SOURCE = 'easy-print-cash';

const parseCashTotal = (value) => {
  const numeric = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : 0;
};

const parseCashDate = (value = '') => {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return new Date().toISOString().slice(0, 10);
  return `${match[3]}-${match[2]}-${match[1]}`;
};

const isEasyPrintIncomingOrder = (order = {}) =>
  String(order.hubOrderId || '').startsWith(`${EASY_PRINT_CASH_SOURCE}:`)
  || String(order.sourceBranchId || '') === EASY_PRINT_CASH_SOURCE;

const buildFinallyStorageIncomingOrder = (order = {}, existing = {}) => {
  const totalAmount = Math.abs(parseCashTotal(order.total));
  const paymentMethod = String(order.paymentMethod || 'online').trim() || 'online';

  return {
    hubOrderId: `${EASY_PRINT_CASH_SOURCE}:${String(order.orderNumber || order.id || '').trim()}`,
    sourceBranchId: EASY_PRINT_CASH_SOURCE,
    sourceBranchName: 'Easy Print',
    paymentMethod,
    cashAmount: paymentMethod === 'dinheiro' ? totalAmount : 0,
    cardAmount: paymentMethod === 'cartao' ? totalAmount : 0,
    onlineAmount: paymentMethod === 'online' ? totalAmount : 0,
    totalAmount,
    operationalDate: parseCashDate(order.date),
    receivedAt: existing.receivedAt || new Date().toISOString()
  };
};

const syncFinallyStorageWithEasyPrintCash = (finallyStorageState = {}, cashOrders = []) => {
  const baseState = finallyStorageState && typeof finallyStorageState === 'object'
    ? finallyStorageState
    : {};
  const currentIncoming = Array.isArray(baseState.incomingOrders) ? baseState.incomingOrders : [];
  const existingEasyPrintById = new Map(
    currentIncoming
      .filter(isEasyPrintIncomingOrder)
      .map((order) => [String(order.hubOrderId || ''), order])
  );
  const preservedIncoming = currentIncoming.filter((order) => !isEasyPrintIncomingOrder(order));
  const seen = new Set();

  const easyPrintIncoming = (Array.isArray(cashOrders) ? cashOrders : [])
    .filter((order) => order && !order.isReprint)
    .map((order) => {
      const hubOrderId = `${EASY_PRINT_CASH_SOURCE}:${String(order.orderNumber || order.id || '').trim()}`;
      return buildFinallyStorageIncomingOrder(order, existingEasyPrintById.get(hubOrderId));
    })
    .filter((order) => {
      if (!order.hubOrderId || seen.has(order.hubOrderId)) return false;
      seen.add(order.hubOrderId);
      return true;
    });

  return {
    ...baseState,
    incomingOrders: [...preservedIncoming, ...easyPrintIncoming]
  };
};

const storeColumns = `
  id, name, city, service_areas, review_areas, receives_orders, auto_print, username, created_at, updated_at
`;

const orderSelect = `
  o.*,
  source.name AS source_store_name,
  target.name AS target_store_name
  FROM orders o
  JOIN stores source ON source.id = o.source_store_id
  JOIN stores target ON target.id = o.target_store_id
`;

export const listStores = (db) =>
  db.prepare(`SELECT ${storeColumns} FROM stores ORDER BY name`).all().map(rowToStore);

export const getStore = (db, storeId) =>
  rowToStore(db.prepare(`SELECT ${storeColumns} FROM stores WHERE id = ?`).get(storeId));

export const createStore = (db, input) => {
  const now = nowIso();
  const id = input.id || createId('store');
  const username = normalizeUsername(input.username || input.id || input.name || id);
  const password = String(input.password || '1234');
  const passwordData = createPasswordHash(password);
  const store = {
    id,
    name: String(input.name || 'Nova loja').trim(),
    city: String(input.city || '').trim(),
    serviceAreas: Array.isArray(input.serviceAreas) ? input.serviceAreas : [],
    reviewAreas: Array.isArray(input.reviewAreas) ? input.reviewAreas : [],
    receivesOrders: input.receivesOrders !== false,
    autoPrint: Boolean(input.autoPrint),
    username
  };

  db.prepare(`
    INSERT INTO stores (
      id, name, city, service_areas, review_areas, receives_orders, auto_print,
      username, password_hash, password_salt, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    store.id,
    store.name,
    store.city,
    encodeJson(store.serviceAreas),
    encodeJson(store.reviewAreas),
    store.receivesOrders ? 1 : 0,
    store.autoPrint ? 1 : 0,
    store.username,
    passwordData.hash,
    passwordData.salt,
    now,
    now
  );

  ensureStoreSettings(db, id);
  return getStore(db, id);
};

export const updateStore = (db, storeId, input) => {
  const current = getStore(db, storeId);
  if (!current) return null;

  const next = {
    name: input.name === undefined ? current.name : String(input.name || '').trim(),
    city: input.city === undefined ? current.city : String(input.city || '').trim(),
    serviceAreas: input.serviceAreas === undefined ? current.serviceAreas : input.serviceAreas,
    reviewAreas: input.reviewAreas === undefined ? current.reviewAreas : input.reviewAreas,
    receivesOrders: input.receivesOrders === undefined ? current.receivesOrders : Boolean(input.receivesOrders),
    autoPrint: input.autoPrint === undefined ? current.autoPrint : Boolean(input.autoPrint),
    username: input.username === undefined ? current.username : normalizeUsername(input.username || current.username)
  };
  const passwordData = input.password
    ? createPasswordHash(String(input.password))
    : null;

  db.prepare(`
    UPDATE stores
    SET name = ?,
        city = ?,
        service_areas = ?,
        review_areas = ?,
        receives_orders = ?,
        auto_print = ?,
        username = ?,
        password_hash = COALESCE(?, password_hash),
        password_salt = COALESCE(?, password_salt),
        updated_at = ?
    WHERE id = ?
  `).run(
    next.name || 'Loja sem nome',
    next.city,
    encodeJson(next.serviceAreas),
    encodeJson(next.reviewAreas),
    next.receivesOrders ? 1 : 0,
    next.autoPrint ? 1 : 0,
    next.username,
    passwordData?.hash || null,
    passwordData?.salt || null,
    nowIso(),
    storeId
  );

  return getStore(db, storeId);
};

export const findStoreByUsername = (db, username) =>
  db.prepare('SELECT * FROM stores WHERE username = ?').get(normalizeUsername(username));

export const loginStore = (db, username, password) => {
  const row = findStoreByUsername(db, username);
  if (!row || !verifyPassword(password, row.password_hash, row.password_salt)) return null;

  const token = createSessionToken();
  const now = nowIso();
  db.prepare(`
    INSERT INTO store_sessions (token, store_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(token, row.id, now, null);

  return {
    token,
    store: getStore(db, row.id)
  };
};

export const getSessionStore = (db, token) => {
  const row = db.prepare(`
    SELECT store_id FROM store_sessions
    WHERE token = ?
      AND (expires_at IS NULL OR expires_at > ?)
  `).get(String(token || ''), nowIso());

  return row?.store_id ? getStore(db, row.store_id) : null;
};

export const logoutSession = (db, token) => {
  db.prepare('DELETE FROM store_sessions WHERE token = ?').run(String(token || ''));
};

const rowToSettings = (row, storeId = '') => {
  const cashOrders = decodeJson(row?.cash_orders, []);
  const finallyStorageState = syncFinallyStorageWithEasyPrintCash(
    decodeJson(row?.finally_storage_state, {}),
    cashOrders
  );

  return {
    storeId: row?.store_id || storeId,
    keywords: decodeJson(row?.keywords, []),
    catalogs: decodeJson(row?.catalogs, []),
    printTemplate: decodeJson(row?.print_template, {}),
    cashOrders,
    cashProcessed: decodeJson(row?.cash_processed, []),
    deliveryBoardState: decodeJson(row?.delivery_board_state, {}),
    finallyStorageState,
    finallyStoragePreview: decodeJson(row?.finally_storage_preview, {}),
    updatedAt: row?.updated_at || ''
  };
};

export const ensureStoreSettings = (db, storeId) => {
  const existing = db.prepare('SELECT store_id FROM store_settings WHERE store_id = ?').get(storeId);
  if (existing) return;

  db.prepare(`
    INSERT INTO store_settings (
      store_id, keywords, catalogs, print_template, cash_orders, cash_processed,
      delivery_board_state, finally_storage_state, finally_storage_preview, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(storeId, '[]', '[]', '{}', '[]', '[]', '{}', '{}', '{}', nowIso());
};

export const getStoreSettings = (db, storeId) => {
  ensureStoreSettings(db, storeId);
  const row = db.prepare('SELECT * FROM store_settings WHERE store_id = ?').get(storeId);
  return rowToSettings(row, storeId);
};

export const updateStoreSettings = (db, storeId, input = {}) => {
  ensureStoreSettings(db, storeId);
  const current = getStoreSettings(db, storeId);
  const next = {
    keywords: input.keywords === undefined ? current.keywords : input.keywords,
    catalogs: input.catalogs === undefined ? current.catalogs : input.catalogs,
    printTemplate: input.printTemplate === undefined ? current.printTemplate : input.printTemplate,
    cashOrders: input.cashOrders === undefined ? current.cashOrders : input.cashOrders,
    cashProcessed: input.cashProcessed === undefined ? current.cashProcessed : input.cashProcessed,
    deliveryBoardState: input.deliveryBoardState === undefined ? current.deliveryBoardState : input.deliveryBoardState,
    finallyStorageState: input.finallyStorageState === undefined ? current.finallyStorageState : input.finallyStorageState,
    finallyStoragePreview: input.finallyStoragePreview === undefined ? current.finallyStoragePreview : input.finallyStoragePreview
  };

  next.finallyStorageState = syncFinallyStorageWithEasyPrintCash(next.finallyStorageState, next.cashOrders);

  db.prepare(`
    UPDATE store_settings
    SET keywords = ?,
        catalogs = ?,
        print_template = ?,
        cash_orders = ?,
        cash_processed = ?,
        delivery_board_state = ?,
        finally_storage_state = ?,
        finally_storage_preview = ?,
        updated_at = ?
    WHERE store_id = ?
  `).run(
    encodeJson(next.keywords),
    encodeJson(next.catalogs),
    encodeJson(next.printTemplate),
    encodeJson(next.cashOrders),
    encodeJson(next.cashProcessed),
    encodeJson(next.deliveryBoardState),
    encodeJson(next.finallyStorageState),
    encodeJson(next.finallyStoragePreview),
    nowIso(),
    storeId
  );

  return getStoreSettings(db, storeId);
};

export const listConnectionsFrom = (db, sourceStoreId) =>
  db.prepare('SELECT * FROM store_connections WHERE source_store_id = ? ORDER BY target_store_id')
    .all(sourceStoreId)
    .map(rowToConnection);

export const getConnection = (db, sourceStoreId, targetStoreId) =>
  rowToConnection(db.prepare(
    'SELECT * FROM store_connections WHERE source_store_id = ? AND target_store_id = ?'
  ).get(sourceStoreId, targetStoreId));

export const upsertConnection = (db, sourceStoreId, targetStoreId, canSendOrders) => {
  const existing = getConnection(db, sourceStoreId, targetStoreId);
  const now = nowIso();

  if (existing) {
    db.prepare(`
      UPDATE store_connections
      SET can_send_orders = ?, updated_at = ?
      WHERE source_store_id = ? AND target_store_id = ?
    `).run(canSendOrders ? 1 : 0, now, sourceStoreId, targetStoreId);
  } else {
    db.prepare(`
      INSERT INTO store_connections (
        id, source_store_id, target_store_id, can_send_orders, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(createId('connection'), sourceStoreId, targetStoreId, canSendOrders ? 1 : 0, now, now);
  }

  return getConnection(db, sourceStoreId, targetStoreId);
};

export const listAllowedTargets = (db, sourceStoreId) =>
  db.prepare(`
    SELECT
      s.id, s.name, s.city, s.service_areas, s.review_areas,
      s.receives_orders, s.auto_print, s.created_at, s.updated_at
    FROM stores s
    JOIN store_connections c ON c.target_store_id = s.id
    WHERE c.source_store_id = ?
      AND c.can_send_orders = 1
      AND s.receives_orders = 1
    ORDER BY s.name
  `).all(sourceStoreId).map(rowToStore);

export const canSendToStore = (db, sourceStoreId, targetStoreId) => {
  const target = getStore(db, targetStoreId);
  if (!target || !target.receivesOrders) return false;

  const connection = getConnection(db, sourceStoreId, targetStoreId);
  return Boolean(connection?.canSendOrders);
};

export const createOrder = (db, input) => {
  const now = nowIso();
  const existing = findRecentOrderForResend(db, input);

  if (existing) {
    db.prepare(`
      UPDATE orders
      SET order_number = ?,
          customer_name = ?,
          raw_text = ?,
          parsed_data = ?,
          route_result = ?,
          status = ?,
          version = version + 1,
          created_at = ?,
          updated_at = ?,
          viewed_at = NULL,
          printed_at = NULL,
          canceled_at = NULL
      WHERE id = ?
    `).run(
      getOrderNumberForDedupe(input),
      String(input.parsedData?.customerName || ''),
      input.rawText,
      encodeJson(input.parsedData),
      encodeJson(input.routeResult),
      ORDER_STATUS.RESENT,
      now,
      now,
      existing.id
    );

    addOrderEvent(db, existing.id, ORDER_STATUS.RESENT, 'Atencao: este pedido foi enviado novamente para a fila.');
    return { ...getOrder(db, existing.id), isResend: true };
  }

  const orderId = createId('order');
  const orderNumber = getOrderNumberForDedupe(input);

  db.prepare(`
    INSERT INTO orders (
      id, order_number, customer_name, source_store_id, target_store_id, raw_text,
      parsed_data, route_result, status, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    orderId,
    orderNumber,
    String(input.parsedData?.customerName || ''),
    input.sourceStoreId,
    input.targetStoreId,
    input.rawText,
    encodeJson(input.parsedData),
    encodeJson(input.routeResult),
    ORDER_STATUS.SENT,
    1,
    now,
    now
  );

  addOrderEvent(db, orderId, ORDER_STATUS.SENT, 'Pedido enviado para a fila da loja destino.');
  return { ...getOrder(db, orderId), isResend: false };
};

export const getOrder = (db, orderId) =>
  rowToOrder(db.prepare(`SELECT ${orderSelect} WHERE o.id = ?`).get(orderId));

export const listReceivedOrders = (db, storeId) =>
  db.prepare(`
    SELECT ${orderSelect}
    WHERE o.target_store_id = ?
      AND o.status != ?
    ORDER BY o.created_at DESC
  `).all(storeId, ORDER_STATUS.CANCELED).map(rowToOrder);

export const listSentOrders = (db, storeId) =>
  db.prepare(`
    SELECT ${orderSelect}
    WHERE o.source_store_id = ?
    ORDER BY o.created_at DESC
  `).all(storeId).map(rowToOrder);

export const markOrderViewed = (db, orderId, expectedVersion) => {
  const order = getOrder(db, orderId);
  if (!order) return null;
  assertOrderVersion(order, expectedVersion);

  if ([ORDER_STATUS.SENT].includes(order.status)) {
    const now = nowIso();
    const result = db.prepare(`
      UPDATE orders
      SET status = ?,
          viewed_at = COALESCE(viewed_at, ?),
          updated_at = ?,
          version = version + 1
      WHERE id = ?
        AND version = ?
    `).run(ORDER_STATUS.VIEWED, now, now, orderId, expectedVersion);
    if (result.changes !== 1) throw createOrderConflictError(getOrder(db, orderId));
    addOrderEvent(db, orderId, ORDER_STATUS.VIEWED, 'Pedido aberto pela loja destino.');
  }
  return getOrder(db, orderId);
};

export const markOrderPrinted = (db, orderId, expectedVersion) => {
  const order = getOrder(db, orderId);
  if (!order) return null;
  assertOrderVersion(order, expectedVersion);

  const now = nowIso();
  const result = db.prepare(`
    UPDATE orders
    SET status = ?,
        printed_at = ?,
        updated_at = ?,
        version = version + 1
    WHERE id = ?
      AND version = ?
  `).run(ORDER_STATUS.PRINTED, now, now, orderId, expectedVersion);
  if (result.changes !== 1) throw createOrderConflictError(getOrder(db, orderId));
  addOrderEvent(db, orderId, ORDER_STATUS.PRINTED, 'Pedido marcado como impresso.');
  return getOrder(db, orderId);
};

export const cancelOrder = (db, orderId, expectedVersion) => {
  const order = getOrder(db, orderId);
  if (!order) return null;
  assertOrderVersion(order, expectedVersion);

  const now = nowIso();
  const result = db.prepare(`
    UPDATE orders
    SET status = ?,
        canceled_at = ?,
        updated_at = ?,
        version = version + 1
    WHERE id = ?
      AND version = ?
  `).run(ORDER_STATUS.CANCELED, now, now, orderId, expectedVersion);
  if (result.changes !== 1) throw createOrderConflictError(getOrder(db, orderId));
  addOrderEvent(db, orderId, ORDER_STATUS.CANCELED, 'Pedido cancelado/removido.');
  return getOrder(db, orderId);
};

export const addOrderEvent = (db, orderId, type, message) => {
  db.prepare(`
    INSERT INTO order_events (id, order_id, type, message, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(createId('event'), orderId, type, message, nowIso());
};

export const listOrderEvents = (db, orderId) =>
  db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at ASC')
    .all(orderId)
    .map((row) => ({
      id: row.id,
      orderId: row.order_id,
      type: row.type,
      message: row.message,
      createdAt: row.created_at
    }));

export const seedInitialData = (db) => {
  const count = db.prepare('SELECT COUNT(*) AS count FROM stores').get().count;
  if (count > 0) {
    ensureExistingStoresReady(db);
    return;
  }

  db.exec('BEGIN;');
  try {
    INITIAL_STORES.forEach((store) => createStore(db, store));

    INITIAL_STORES.forEach((source) => {
      INITIAL_STORES.forEach((target) => {
        upsertConnection(db, source.id, target.id, true);
      });
    });

    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }

  ensureExistingStoresReady(db);
};

export const connectStoreToAll = (db, storeId) => {
  listStores(db).forEach((store) => {
    upsertConnection(db, storeId, store.id, true);
    upsertConnection(db, store.id, storeId, true);
  });
};

export const ensureExistingStoresReady = (db) => {
  const rows = db.prepare('SELECT id, username, password_hash, password_salt FROM stores').all();

  rows.forEach((row) => {
    if (!row.username || !row.password_hash || !row.password_salt) {
      const passwordData = createPasswordHash('1234');
      db.prepare(`
        UPDATE stores
        SET username = COALESCE(username, ?),
            password_hash = COALESCE(password_hash, ?),
            password_salt = COALESCE(password_salt, ?),
            updated_at = ?
        WHERE id = ?
      `).run(normalizeUsername(row.id), passwordData.hash, passwordData.salt, nowIso(), row.id);
    }

    ensureStoreSettings(db, row.id);
  });
};
