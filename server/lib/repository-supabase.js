import { createClient } from '@supabase/supabase-js';
import { ORDER_STATUS } from './routing-core.js';
import { INITIAL_STORES } from './seed-data.js';
import { createPasswordHash, createSessionToken, normalizeUsername, verifyPassword } from './auth.js';

const RESEND_WINDOW_MS = 24 * 60 * 60 * 1000;
const ORDER_RETENTION_DAYS = 2;
const ORDER_LIST_LIMIT = 200;
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
  return version;
};

export const nowIso = () => new Date().toISOString();

export const createId = (prefix = 'id') =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const parseJsonValue = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const toJsonArray = (value) => Array.isArray(value) ? value : [];
const toJsonObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const normalizeOptionalIso = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return '';

  const timestamp = new Date(String(value)).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
};

const throwIfError = (error) => {
  if (!error) return;
  const nextError = new Error(error.message || 'Falha ao acessar o Supabase.');
  nextError.code = error.code;
  nextError.details = error.details;
  nextError.hint = error.hint;
  throw nextError;
};

const readMany = async (query) => {
  const { data, error } = await query;
  throwIfError(error);
  return data || [];
};

const readOne = async (query) => {
  const { data, error } = await query.maybeSingle();
  throwIfError(error);
  return data || null;
};

const writeOne = async (query) => {
  const { data, error } = await query.single();
  throwIfError(error);
  return data;
};

const storeColumns = `
  id,
  name,
  city,
  service_areas,
  review_areas,
  receives_orders,
  auto_print,
  username,
  created_at,
  updated_at
`;

const orderSelect = `
  id,
  order_number,
  customer_name,
  source_store_id,
  target_store_id,
  raw_text,
  parsed_data,
  route_result,
  status,
  version,
  created_at,
  updated_at,
  viewed_at,
  printed_at,
  canceled_at,
  source_store:stores!orders_source_store_id_fkey(name),
  target_store:stores!orders_target_store_id_fkey(name)
`;

// A previa do Finally Storage pode conter uma imagem base64 de varios MB.
// Ela e mantida apenas no dispositivo e nunca deve acompanhar leituras comuns.
const settingsSelect = `
  store_id,
  keywords,
  catalogs,
  print_template,
  cash_orders,
  cash_processed,
  sent_cash_cleared_at,
  delivery_board_state,
  finally_storage_state,
  updated_at
`;

const rowToStore = (row) => row && ({
  id: row.id,
  name: row.name,
  city: row.city || '',
  serviceAreas: toJsonArray(parseJsonValue(row.service_areas, [])),
  reviewAreas: toJsonArray(parseJsonValue(row.review_areas, [])),
  receivesOrders: row.receives_orders !== false,
  autoPrint: Boolean(row.auto_print),
  username: row.username || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const rowToConnection = (row) => row && ({
  id: row.id,
  sourceStoreId: row.source_store_id,
  targetStoreId: row.target_store_id,
  canSendOrders: row.can_send_orders !== false,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const rowToOrder = (row) => row && ({
  id: row.id,
  orderNumber: row.order_number || '',
  customerName: row.customer_name || '',
  sourceStoreId: row.source_store_id,
  targetStoreId: row.target_store_id,
  rawText: row.raw_text,
  parsedData: toJsonObject(parseJsonValue(row.parsed_data, {})),
  routeResult: toJsonObject(parseJsonValue(row.route_result, {})),
  status: row.status,
  version: Number(row.version || 1),
  createdAt: row.created_at,
  updatedAt: row.updated_at || row.created_at,
  viewedAt: row.viewed_at || '',
  printedAt: row.printed_at || '',
  canceledAt: row.canceled_at || '',
  sourceStoreName: row.source_store?.name || row.source_store_name || '',
  targetStoreName: row.target_store?.name || row.target_store_name || '',
  isResend: row.status === ORDER_STATUS.RESENT
});

const getOrderNumberForDedupe = (input = {}) =>
  String(input.parsedData?.orderNumber || input.parsedData?.locator || '').trim();

const isWithinResendWindow = (value) => {
  const timestamp = new Date(value || '').getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= RESEND_WINDOW_MS;
};

const findRecentOrderForResend = async (db, input) => {
  const orderNumber = getOrderNumberForDedupe(input);
  if (!orderNumber) return null;

  const rows = await readMany(
    db.from('orders')
      .select('id, created_at, version')
      .eq('source_store_id', input.sourceStoreId)
      .eq('target_store_id', input.targetStoreId)
      .eq('order_number', orderNumber)
      .order('created_at', { ascending: false })
      .limit(5)
  );

  return rows.find((row) => isWithinResendWindow(row.created_at)) || null;
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

const rowToSettings = (row, storeId = '') => {
  const cashOrders = toJsonArray(parseJsonValue(row?.cash_orders, []));
  const finallyStorageState = syncFinallyStorageWithEasyPrintCash(
    toJsonObject(parseJsonValue(row?.finally_storage_state, {})),
    cashOrders
  );

  return {
    storeId: row?.store_id || storeId,
    keywords: toJsonArray(parseJsonValue(row?.keywords, [])),
    catalogs: toJsonArray(parseJsonValue(row?.catalogs, [])),
    printTemplate: toJsonObject(parseJsonValue(row?.print_template, {})),
    cashOrders,
    cashProcessed: toJsonArray(parseJsonValue(row?.cash_processed, [])),
    sentCashClearedAt: row?.sent_cash_cleared_at || '',
    deliveryBoardState: toJsonObject(parseJsonValue(row?.delivery_board_state, {})),
    finallyStorageState,
    updatedAt: row?.updated_at || ''
  };
};

const getOperationalCleanupAt = async (db) => {
  const { data, error } = await db.from('easyprint_maintenance_state')
    .select('last_run_at')
    .eq('job_name', 'easyprint-retention-cleanup')
    .maybeSingle();

  // Permite implantar o backend antes de reaplicar retention-cleanup.sql.
  if (error && ['42P01', 'PGRST205'].includes(error.code)) return '';
  throwIfError(error);
  return normalizeOptionalIso(data?.last_run_at) || '';
};

const hasOperationalSettingsPatch = (input = {}) => [
  'cashOrders',
  'cashProcessed',
  'sentCashClearedAt',
  'deliveryBoardState',
  'finallyStorageState',
  'finallyStoragePreview'
].some((field) => input[field] !== undefined);

const normalizeUpdatedAfter = (value) => {
  const timestamp = new Date(String(value || '')).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
};

export const openDatabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para usar o Supabase.');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
};

export const migrate = async () => {
  // Supabase schema is applied with supabase/schema.sql.
};

export const listStores = async (db) => {
  const rows = await readMany(db.from('stores').select(storeColumns).order('name'));
  return rows.map(rowToStore);
};

export const getStore = async (db, storeId) => {
  const row = await readOne(
    db.from('stores').select(storeColumns).eq('id', storeId)
  );
  return rowToStore(row);
};

export const createStore = async (db, input) => {
  const now = nowIso();
  const id = input.id || createId('store');
  const username = normalizeUsername(input.username || input.id || input.name || id);
  const password = String(input.password || '1234');
  const passwordData = createPasswordHash(password);

  const row = await writeOne(
    db.from('stores')
      .insert({
        id,
        name: String(input.name || 'Nova loja').trim(),
        city: String(input.city || '').trim(),
        service_areas: Array.isArray(input.serviceAreas) ? input.serviceAreas : [],
        review_areas: Array.isArray(input.reviewAreas) ? input.reviewAreas : [],
        receives_orders: input.receivesOrders !== false,
        auto_print: Boolean(input.autoPrint),
        username,
        password_hash: passwordData.hash,
        password_salt: passwordData.salt,
        created_at: now,
        updated_at: now
      })
      .select(storeColumns)
  );

  await ensureStoreSettings(db, id);
  return rowToStore(row);
};

export const updateStore = async (db, storeId, input) => {
  const current = await getStore(db, storeId);
  if (!current) return null;

  const passwordData = input.password
    ? createPasswordHash(String(input.password))
    : null;
  const row = {
    name: input.name === undefined ? current.name : String(input.name || '').trim() || 'Loja sem nome',
    city: input.city === undefined ? current.city : String(input.city || '').trim(),
    service_areas: input.serviceAreas === undefined ? current.serviceAreas : input.serviceAreas,
    review_areas: input.reviewAreas === undefined ? current.reviewAreas : input.reviewAreas,
    receives_orders: input.receivesOrders === undefined ? current.receivesOrders : Boolean(input.receivesOrders),
    auto_print: input.autoPrint === undefined ? current.autoPrint : Boolean(input.autoPrint),
    username: input.username === undefined ? current.username : normalizeUsername(input.username || current.username),
    updated_at: nowIso()
  };

  if (passwordData) {
    row.password_hash = passwordData.hash;
    row.password_salt = passwordData.salt;
  }

  const updated = await readOne(
    db.from('stores')
      .update(row)
      .eq('id', storeId)
      .select(storeColumns)
  );

  return rowToStore(updated);
};

export const findStoreByUsername = async (db, username) => {
  const row = await readOne(
    db.from('stores')
      .select('*')
      .eq('username', normalizeUsername(username))
  );
  return row;
};

export const loginStore = async (db, username, password) => {
  const row = await findStoreByUsername(db, username);
  if (!row || !verifyPassword(password, row.password_hash, row.password_salt)) return null;

  const token = createSessionToken();
  const now = nowIso();
  const { error } = await db.from('store_sessions').insert({
    token,
    store_id: row.id,
    created_at: now,
    expires_at: null
  });
  throwIfError(error);

  return {
    token,
    store: await getStore(db, row.id)
  };
};

export const getSessionStore = async (db, token) => {
  const row = await readOne(
    db.from('store_sessions')
      .select('store_id, expires_at')
      .eq('token', String(token || ''))
  );

  if (!row?.store_id) return null;
  if (row.expires_at && row.expires_at <= nowIso()) return null;

  return getStore(db, row.store_id);
};

export const logoutSession = async (db, token) => {
  const { error } = await db.from('store_sessions').delete().eq('token', String(token || ''));
  throwIfError(error);
};

export const ensureStoreSettings = async (db, storeId) => {
  const existing = await readOne(
    db.from('store_settings')
      .select('store_id')
      .eq('store_id', storeId)
  );
  if (existing) return;

  const { error } = await db.from('store_settings').insert({
    store_id: storeId,
    keywords: [],
    catalogs: [],
    print_template: {},
    cash_orders: [],
    cash_processed: [],
    delivery_board_state: {},
    finally_storage_state: {},
    finally_storage_preview: {},
    updated_at: nowIso()
  });
  throwIfError(error);
};

export const getStoreSettings = async (db, storeId) => {
  await ensureStoreSettings(db, storeId);
  const [row, operationalCleanupAt] = await Promise.all([
    readOne(
      db.from('store_settings')
        .select(settingsSelect)
        .eq('store_id', storeId)
    ),
    getOperationalCleanupAt(db)
  ]);
  return {
    ...rowToSettings(row, storeId),
    operationalCleanupAt
  };
};

export const updateStoreSettings = async (db, storeId, input = {}) => {
  await ensureStoreSettings(db, storeId);
  const updatedAt = nowIso();
  const updatePayload = { updated_at: updatedAt };
  const settingsPatch = { storeId, updatedAt };

  if (hasOperationalSettingsPatch(input)) {
    const operationalCleanupAt = await getOperationalCleanupAt(db);
    const expectedCleanupAt = normalizeOptionalIso(input.operationalCleanupAt) || '';
    if (operationalCleanupAt && expectedCleanupAt !== operationalCleanupAt) {
      const error = new Error('Os dados operacionais foram limpos. Recarregue antes de salvar novamente.');
      error.statusCode = 409;
      error.code = 'OPERATIONAL_DATA_RESET';
      error.operationalCleanupAt = operationalCleanupAt;
      throw error;
    }
    settingsPatch.operationalCleanupAt = operationalCleanupAt;
  }

  if (input.keywords !== undefined) {
    settingsPatch.keywords = toJsonArray(input.keywords);
    updatePayload.keywords = settingsPatch.keywords;
  }
  if (input.catalogs !== undefined) {
    settingsPatch.catalogs = toJsonArray(input.catalogs);
    updatePayload.catalogs = settingsPatch.catalogs;
  }
  if (input.printTemplate !== undefined) {
    settingsPatch.printTemplate = toJsonObject(input.printTemplate);
    updatePayload.print_template = settingsPatch.printTemplate;
  }
  if (input.cashProcessed !== undefined) {
    settingsPatch.cashProcessed = toJsonArray(input.cashProcessed);
    updatePayload.cash_processed = settingsPatch.cashProcessed;
  }
  if (input.sentCashClearedAt !== undefined) {
    settingsPatch.sentCashClearedAt = normalizeOptionalIso(input.sentCashClearedAt);
    updatePayload.sent_cash_cleared_at = settingsPatch.sentCashClearedAt || null;
  }
  if (input.deliveryBoardState !== undefined) {
    settingsPatch.deliveryBoardState = toJsonObject(input.deliveryBoardState);
    updatePayload.delivery_board_state = settingsPatch.deliveryBoardState;
  }

  // O estado do caixa e o fechamento sao sincronizados entre si. Para esses
  // dois campos, le somente as colunas necessarias em vez da linha completa.
  if (input.cashOrders !== undefined || input.finallyStorageState !== undefined) {
    let currentCashOrders = [];
    let currentFinallyStorageState = {};

    if (input.cashOrders === undefined || input.finallyStorageState === undefined) {
      const missingColumns = [];
      if (input.cashOrders === undefined) missingColumns.push('cash_orders');
      if (input.finallyStorageState === undefined) missingColumns.push('finally_storage_state');
      const current = await readOne(
        db.from('store_settings')
          .select(missingColumns.join(', '))
          .eq('store_id', storeId)
      );
      currentCashOrders = toJsonArray(parseJsonValue(current?.cash_orders, []));
      currentFinallyStorageState = toJsonObject(parseJsonValue(current?.finally_storage_state, {}));
    }

    const nextCashOrders = input.cashOrders === undefined
      ? currentCashOrders
      : toJsonArray(input.cashOrders);
    const requestedFinallyState = input.finallyStorageState === undefined
      ? currentFinallyStorageState
      : toJsonObject(input.finallyStorageState);
    const nextFinallyState = syncFinallyStorageWithEasyPrintCash(requestedFinallyState, nextCashOrders);

    if (input.cashOrders !== undefined) {
      settingsPatch.cashOrders = nextCashOrders;
      updatePayload.cash_orders = nextCashOrders;
    }
    settingsPatch.finallyStorageState = nextFinallyState;
    updatePayload.finally_storage_state = nextFinallyState;
  }

  // Remove qualquer previa base64 legada na primeira atualizacao feita pela
  // loja. Clientes antigos tambem deixam de conseguir persisti-la novamente.
  updatePayload.finally_storage_preview = {};

  const { error } = await db.from('store_settings')
    .update(updatePayload)
    .eq('store_id', storeId);
  throwIfError(error);

  return settingsPatch;
};

export const listConnectionsFrom = async (db, sourceStoreId) => {
  const rows = await readMany(
    db.from('store_connections')
      .select('*')
      .eq('source_store_id', sourceStoreId)
      .order('target_store_id')
  );
  return rows.map(rowToConnection);
};

export const getConnection = async (db, sourceStoreId, targetStoreId) => {
  const row = await readOne(
    db.from('store_connections')
      .select('*')
      .eq('source_store_id', sourceStoreId)
      .eq('target_store_id', targetStoreId)
  );
  return rowToConnection(row);
};

export const upsertConnection = async (db, sourceStoreId, targetStoreId, canSendOrders) => {
  const existing = await getConnection(db, sourceStoreId, targetStoreId);
  const now = nowIso();

  if (existing) {
    const row = await readOne(
      db.from('store_connections')
        .update({
          can_send_orders: Boolean(canSendOrders),
          updated_at: now
        })
        .eq('source_store_id', sourceStoreId)
        .eq('target_store_id', targetStoreId)
        .select('*')
    );
    return rowToConnection(row);
  }

  const row = await writeOne(
    db.from('store_connections')
      .insert({
        id: createId('connection'),
        source_store_id: sourceStoreId,
        target_store_id: targetStoreId,
        can_send_orders: Boolean(canSendOrders),
        created_at: now,
        updated_at: now
      })
      .select('*')
  );

  return rowToConnection(row);
};

export const listAllowedTargets = async (db, sourceStoreId) => {
  const connections = await readMany(
    db.from('store_connections')
      .select('target_store_id')
      .eq('source_store_id', sourceStoreId)
      .eq('can_send_orders', true)
  );
  const targetIds = connections.map((connection) => connection.target_store_id).filter(Boolean);
  if (!targetIds.length) return [];

  const rows = await readMany(
    db.from('stores')
      .select(storeColumns)
      .in('id', targetIds)
      .eq('receives_orders', true)
      .order('name')
  );

  return rows.map(rowToStore);
};

export const canSendToStore = async (db, sourceStoreId, targetStoreId) => {
  const target = await getStore(db, targetStoreId);
  if (!target || !target.receivesOrders) return false;

  const connection = await getConnection(db, sourceStoreId, targetStoreId);
  return Boolean(connection?.canSendOrders);
};

export const createOrder = async (db, input) => {
  const now = nowIso();
  const orderNumber = getOrderNumberForDedupe(input);
  const existing = await findRecentOrderForResend(db, input);

  if (existing) {
    const { error } = await db.from('orders')
      .update({
        order_number: orderNumber,
        customer_name: String(input.parsedData?.customerName || ''),
        raw_text: input.rawText,
        parsed_data: input.parsedData,
        route_result: input.routeResult,
        status: ORDER_STATUS.RESENT,
        version: Number(existing.version || 1) + 1,
        created_at: now,
        updated_at: now,
        viewed_at: null,
        printed_at: null,
        canceled_at: null
      })
      .eq('id', existing.id);
    throwIfError(error);

    await addOrderEvent(db, existing.id, ORDER_STATUS.RESENT, 'Atencao: este pedido foi enviado novamente para a fila.');
    return { ...(await getOrder(db, existing.id)), isResend: true };
  }

  const orderId = createId('order');

  const { error } = await db.from('orders').insert({
    id: orderId,
    order_number: orderNumber,
    customer_name: String(input.parsedData?.customerName || ''),
    source_store_id: input.sourceStoreId,
    target_store_id: input.targetStoreId,
    raw_text: input.rawText,
    parsed_data: input.parsedData,
    route_result: input.routeResult,
    status: ORDER_STATUS.SENT,
    version: 1,
    created_at: now,
    updated_at: now
  });
  throwIfError(error);

  await addOrderEvent(db, orderId, ORDER_STATUS.SENT, 'Pedido enviado para a fila da loja destino.');
  return { ...(await getOrder(db, orderId)), isResend: false };
};

export const getOrder = async (db, orderId) => {
  const row = await readOne(
    db.from('orders')
      .select(orderSelect)
      .eq('id', orderId)
  );
  return rowToOrder(row);
};

export const listReceivedOrders = async (db, storeId, options = {}) => {
  const retentionCutoff = new Date(Date.now() - ORDER_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const updatedAfter = normalizeUpdatedAfter(options.updatedAfter);
  let query = db.from('orders')
    .select(orderSelect)
    .eq('target_store_id', storeId)
    .gte('created_at', retentionCutoff)
    .order('created_at', { ascending: false })
    .limit(ORDER_LIST_LIMIT);

  if (updatedAfter) {
    // Inclui cancelados no delta para o cliente conseguir removê-los da fila.
    query = query.gt('updated_at', updatedAfter);
  } else {
    query = query.neq('status', ORDER_STATUS.CANCELED);
  }

  const rows = await readMany(query);
  return rows.map(rowToOrder);
};

export const listSentOrders = async (db, storeId, options = {}) => {
  const retentionCutoff = new Date(Date.now() - ORDER_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const updatedAfter = normalizeUpdatedAfter(options.updatedAfter);
  let query = db.from('orders')
    .select(orderSelect)
    .eq('source_store_id', storeId)
    .gte('created_at', retentionCutoff)
    .order('created_at', { ascending: false })
    .limit(ORDER_LIST_LIMIT);

  if (updatedAfter) query = query.gt('updated_at', updatedAfter);

  const rows = await readMany(query);
  return rows.map(rowToOrder);
};

export const markOrderViewed = async (db, orderId, expectedVersion) => {
  const order = await getOrder(db, orderId);
  if (!order) return null;
  const version = assertOrderVersion(order, expectedVersion);

  if ([ORDER_STATUS.SENT].includes(order.status)) {
    const now = nowIso();
    const { data, error } = await db.from('orders')
      .update({
        status: ORDER_STATUS.VIEWED,
        viewed_at: order.viewedAt || now,
        updated_at: now,
        version: version + 1
      })
      .eq('id', orderId)
      .eq('version', version)
      .select('id')
      .maybeSingle();
    throwIfError(error);
    if (!data) throw createOrderConflictError(await getOrder(db, orderId));
    await addOrderEvent(db, orderId, ORDER_STATUS.VIEWED, 'Pedido aberto pela loja destino.');
  }

  return getOrder(db, orderId);
};

export const markOrderPrinted = async (db, orderId, expectedVersion) => {
  const order = await getOrder(db, orderId);
  if (!order) return null;
  const version = assertOrderVersion(order, expectedVersion);

  const now = nowIso();
  const { data, error } = await db.from('orders')
    .update({
      status: ORDER_STATUS.PRINTED,
      printed_at: now,
      updated_at: now,
      version: version + 1
    })
    .eq('id', orderId)
    .eq('version', version)
    .select('id')
    .maybeSingle();
  throwIfError(error);
  if (!data) throw createOrderConflictError(await getOrder(db, orderId));
  await addOrderEvent(db, orderId, ORDER_STATUS.PRINTED, 'Pedido marcado como impresso.');
  return getOrder(db, orderId);
};

export const cancelOrder = async (db, orderId, expectedVersion) => {
  const order = await getOrder(db, orderId);
  if (!order) return null;
  const version = assertOrderVersion(order, expectedVersion);

  const now = nowIso();
  const { data, error } = await db.from('orders')
    .update({
      status: ORDER_STATUS.CANCELED,
      canceled_at: now,
      updated_at: now,
      version: version + 1
    })
    .eq('id', orderId)
    .eq('version', version)
    .select('id')
    .maybeSingle();
  throwIfError(error);
  if (!data) throw createOrderConflictError(await getOrder(db, orderId));
  await addOrderEvent(db, orderId, ORDER_STATUS.CANCELED, 'Pedido cancelado/removido.');
  return getOrder(db, orderId);
};

export const addOrderEvent = async (db, orderId, type, message) => {
  const now = nowIso();
  const { error } = await db.from('order_events').insert({
    id: createId('event'),
    order_id: orderId,
    type,
    message,
    created_at: now
  });
  throwIfError(error);
};

export const listOrderEvents = async (db, orderId) => {
  const rows = await readMany(
    db.from('order_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
  );

  return rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    type: row.type,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at
  }));
};

export const seedInitialData = async (db) => {
  const { count, error } = await db.from('stores').select('id', { count: 'exact', head: true });
  throwIfError(error);

  if (count > 0) {
    await ensureExistingStoresReady(db);
    return;
  }

  for (const store of INITIAL_STORES) {
    await createStore(db, store);
  }

  for (const source of INITIAL_STORES) {
    for (const target of INITIAL_STORES) {
      await upsertConnection(db, source.id, target.id, true);
    }
  }

  await ensureExistingStoresReady(db);
};

export const connectStoreToAll = async (db, storeId) => {
  const stores = await listStores(db);

  for (const store of stores) {
    await upsertConnection(db, storeId, store.id, true);
    await upsertConnection(db, store.id, storeId, true);
  }
};

export const ensureExistingStoresReady = async (db) => {
  const rows = await readMany(
    db.from('stores')
      .select('id, username, password_hash, password_salt')
  );

  for (const row of rows) {
    if (!row.username || !row.password_hash || !row.password_salt) {
      const passwordData = createPasswordHash('1234');
      const update = {
        username: row.username || normalizeUsername(row.id),
        password_hash: row.password_hash || passwordData.hash,
        password_salt: row.password_salt || passwordData.salt,
        updated_at: nowIso()
      };
      const { error } = await db.from('stores').update(update).eq('id', row.id);
      throwIfError(error);
    }

    await ensureStoreSettings(db, row.id);
  }
};
