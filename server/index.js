import http from 'node:http';
import { URL } from 'node:url';
import { createDataStore } from './lib/data-store.js';
import { createOrderRelayAuth } from './lib/order-relay-auth.js';
import { ORDER_STATUS, parseIfoodOrder, routeOrder } from './lib/routing-core.js';

const PORT = Number(process.env.PORT || process.env.ROUTING_API_PORT || 3333);
const HOST = process.env.ROUTING_API_HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const CONFIGURED_CORS_ORIGIN = process.env.CORS_ORIGIN || process.env.FRONTEND_ORIGIN || '*';
const DESKTOP_CORS_ORIGINS = ['easyhub://app'];
const dataStore = await createDataStore();
const orderRelayAuth = createOrderRelayAuth({ secret: process.env.ORDER_RELAY_SECRET });
const SESSION_CACHE_TTL_MS = 60 * 1000;
const SESSION_CACHE_MAX_ENTRIES = 500;
const sessionStoreCache = new Map();

const parseCorsOrigins = (value) =>
  String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const configuredCorsOrigins = parseCorsOrigins(CONFIGURED_CORS_ORIGIN);
const allowAllCorsOrigins = configuredCorsOrigins.includes('*');
const allowedCorsOrigins = new Set([
  ...configuredCorsOrigins.filter((origin) => origin !== '*'),
  ...DESKTOP_CORS_ORIGINS
]);

const getCorsOrigin = (request) => {
  const requestOrigin = String(request.headers.origin || '').trim();
  if (allowAllCorsOrigins) return requestOrigin || '*';
  if (requestOrigin && allowedCorsOrigins.has(requestOrigin)) return requestOrigin;
  return configuredCorsOrigins[0] || '*';
};

const getJsonHeaders = (request) => {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': getCorsOrigin(request),
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Current-Store-Id,X-Session-Token',
    'Vary': 'Origin'
  };
};

const sendJson = (request, response, status, payload) => {
  response.writeHead(status, getJsonHeaders(request));
  response.end(JSON.stringify(payload));
};

const sendError = (request, response, status, message, details = {}) => {
  sendJson(request, response, status, { error: message, ...details });
};

const readJsonBody = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('JSON invalido.');
    error.statusCode = 400;
    throw error;
  }
};

const splitAreasInput = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }

  return String(value || '')
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const getSessionToken = (request) => String(request.headers['x-session-token'] || '').trim();

const getCachedSessionStore = (token) => {
  const cached = sessionStoreCache.get(token);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    sessionStoreCache.delete(token);
    return null;
  }
  return cached.store;
};

const cacheSessionStore = (token, store) => {
  if (!token || !store) return;
  if (sessionStoreCache.size >= SESSION_CACHE_MAX_ENTRIES) {
    const oldestToken = sessionStoreCache.keys().next().value;
    if (oldestToken) sessionStoreCache.delete(oldestToken);
  }
  sessionStoreCache.set(token, {
    store,
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS
  });
};

const requireCurrentStore = async (request, response) => {
  const token = getSessionToken(request);

  if (!token) {
    sendError(request, response, 401, 'Entre com usuario e senha da loja para continuar.');
    return null;
  }

  let store = getCachedSessionStore(token);
  const relayStoreId = orderRelayAuth.verify(token);
  if (!store && relayStoreId) {
    store = await dataStore.getStore(relayStoreId);
    if (store) cacheSessionStore(token, store);
  }
  if (!store) {
    store = await dataStore.getSessionStore(token);
    if (store) cacheSessionStore(token, store);
  }
  if (!store) {
    sendError(request, response, 401, 'Sessao expirada. Entre novamente com usuario e senha da loja.');
    return null;
  }

  return store;
};

const handleOrderRelaySession = async (request, response) => {
  if (request.method !== 'POST') return false;

  const body = await readJsonBody(request);
  const storeId = String(body.storeId || '').trim();
  const store = storeId ? await dataStore.getStore(storeId) : null;

  if (!store) {
    sendError(request, response, 404, 'Esta loja nao esta cadastrada no canal de pedidos.');
    return true;
  }

  const token = orderRelayAuth.issue(store.id);
  cacheSessionStore(token, store);
  sendJson(request, response, 200, {
    token,
    store: {
      id: store.id,
      name: store.name
    }
  });
  return true;
};

const buildMePayload = async (currentStore) => {
  const [stores, connections, allowedTargets] = await Promise.all([
    dataStore.listStores(),
    dataStore.listConnectionsFrom(currentStore.id),
    dataStore.listAllowedTargets(currentStore.id)
  ]);

  return {
    store: currentStore,
    stores,
    connections,
    allowedTargets
  };
};

const routeForCurrentStore = async (currentStore, rawText) => {
  const parsedData = parseIfoodOrder(rawText);
  const [stores, allowedTargets] = await Promise.all([
    dataStore.listStores(),
    dataStore.listAllowedTargets(currentStore.id)
  ]);
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

const ensureOrderAccess = (request, order, currentStore, response) => {
  if (!order) {
    sendError(request, response, 404, 'Pedido nao encontrado.');
    return false;
  }

  if (order.sourceStoreId !== currentStore.id && order.targetStoreId !== currentStore.id) {
    sendError(request, response, 403, 'Esta loja nao tem acesso a esse pedido.');
    return false;
  }

  return true;
};

const getVersionFromBody = (body = {}) => {
  const version = Number(body.version);
  return Number.isInteger(version) && version > 0 ? version : null;
};

const sendOrderVersionConflict = (request, response, error) => {
  sendError(request, response, 409, error.message || 'Esse pedido foi atualizado em outra maquina. Recarregue a fila.', {
    code: error.code || 'ORDER_VERSION_CONFLICT',
    order: error.order || null
  });
};

const handleSetupStores = async (request, response) => {
  if (request.method === 'GET') {
    sendJson(request, response, 200, { stores: await dataStore.listStores() });
    return true;
  }

  if (request.method === 'POST') {
    const body = await readJsonBody(request);
    const created = await dataStore.createStore({
      name: body.name,
      city: body.city,
      username: body.username,
      password: body.password,
      serviceAreas: splitAreasInput(body.serviceAreas),
      reviewAreas: splitAreasInput(body.reviewAreas),
      receivesOrders: true,
      autoPrint: false
    });
    await dataStore.connectStoreToAll(created.id);
    sendJson(request, response, 201, { store: created });
    return true;
  }

  return false;
};

const handleAuthLogin = async (request, response) => {
  if (request.method !== 'POST') return false;

  const body = await readJsonBody(request);
  const session = await dataStore.loginStore(body.username, body.password);

  if (!session) {
    sendError(request, response, 401, 'Usuario ou senha da loja invalidos.');
    return true;
  }

  cacheSessionStore(session.token, session.store);
  sendJson(request, response, 200, session);
  return true;
};

const handleAuthLogout = async (request, response) => {
  if (request.method !== 'POST') return false;

  const token = getSessionToken(request);
  if (token) await dataStore.logoutSession(token);
  sessionStoreCache.delete(token);
  sendJson(request, response, 200, { ok: true });
  return true;
};

const handleMe = async (request, response) => {
  const currentStore = await requireCurrentStore(request, response);
  if (!currentStore) return true;

  if (request.method === 'GET') {
    sendJson(request, response, 200, await buildMePayload(currentStore));
    return true;
  }

  return false;
};

const handleMyStore = async (request, response) => {
  const currentStore = await requireCurrentStore(request, response);
  if (!currentStore) return true;

  if (request.method !== 'PATCH') return false;

  const body = await readJsonBody(request);
  const updated = await dataStore.updateStore(currentStore.id, {
    username: body.username,
    password: body.password,
    name: body.name,
    city: body.city,
    serviceAreas: body.serviceAreas === undefined ? undefined : splitAreasInput(body.serviceAreas),
    reviewAreas: body.reviewAreas === undefined ? undefined : splitAreasInput(body.reviewAreas),
    receivesOrders: body.receivesOrders,
    autoPrint: body.autoPrint
  });

  cacheSessionStore(getSessionToken(request), updated);
  sendJson(request, response, 200, { store: updated });
  return true;
};

const handleStoreSettings = async (request, response) => {
  const currentStore = await requireCurrentStore(request, response);
  if (!currentStore) return true;

  if (request.method === 'GET') {
    sendJson(request, response, 200, { settings: await dataStore.getStoreSettings(currentStore.id) });
    return true;
  }

  if (request.method === 'PATCH') {
    const body = await readJsonBody(request);
    const settings = await dataStore.updateStoreSettings(currentStore.id, body);
    sendJson(request, response, 200, { settings });
    return true;
  }

  return false;
};

const handleConnection = async (request, response, targetStoreId) => {
  const currentStore = await requireCurrentStore(request, response);
  if (!currentStore) return true;

  if (request.method !== 'PUT') return false;

  const targetStore = await dataStore.getStore(targetStoreId);
  if (!targetStore) {
    sendError(request, response, 404, 'Loja destino nao encontrada.');
    return true;
  }

  const body = await readJsonBody(request);
  const connection = await dataStore.upsertConnection(currentStore.id, targetStoreId, Boolean(body.canSendOrders));
  sendJson(request, response, 200, { connection, allowedTargets: await dataStore.listAllowedTargets(currentStore.id) });
  return true;
};

const handleParseRoute = async (request, response) => {
  const currentStore = await requireCurrentStore(request, response);
  if (!currentStore) return true;

  if (request.method !== 'POST') return false;

  const body = await readJsonBody(request);
  const rawText = String(body.rawText || '');
  const result = await routeForCurrentStore(currentStore, rawText);
  sendJson(request, response, 200, result);
  return true;
};

const handleCreateOrder = async (request, response) => {
  const currentStore = await requireCurrentStore(request, response);
  if (!currentStore) return true;

  if (request.method !== 'POST') return false;

  const body = await readJsonBody(request);
  const rawText = String(body.rawText || '').trim();
  const targetStoreId = String(body.targetStoreId || '').trim();

  if (!rawText) {
    sendError(request, response, 400, 'Cole um pedido antes de enviar.');
    return true;
  }

  if (!targetStoreId) {
    sendError(request, response, 400, 'Escolha a loja de destino.');
    return true;
  }

  if (!(await dataStore.canSendToStore(currentStore.id, targetStoreId))) {
    sendError(request, response, 403, 'Esta loja nao esta liberada para receber pedidos da sua loja.');
    return true;
  }

  const { parsedData, routeResult } = await routeForCurrentStore(currentStore, rawText);

  if (routeResult.requiresReview && !body.routeConfirmed) {
    sendError(request, response, 409, 'Confira a regiao antes de enviar esse pedido.', {
      requiresReview: true,
      routeResult,
      parsedData
    });
    return true;
  }

  const order = await dataStore.createOrder({
    rawText,
    parsedData,
    routeResult,
    sourceStoreId: currentStore.id,
    targetStoreId
  });

  sendJson(request, response, order.isResend ? 200 : 201, {
    order,
    duplicate: Boolean(order.isResend),
    message: order.isResend
      ? 'Atencao: este pedido esta sendo enviado novamente. Ele nao sera lancado outra vez no caixa.'
      : 'Pedido enviado para a fila.'
  });
  return true;
};

const handleOrdersCollection = async (request, response, kind, url) => {
  const currentStore = await requireCurrentStore(request, response);
  if (!currentStore) return true;

  if (request.method !== 'GET') return false;

  const rawUpdatedAfter = String(url.searchParams.get('updatedAfter') || '').trim();
  const updatedTimestamp = new Date(rawUpdatedAfter).getTime();
  const updatedAfter = rawUpdatedAfter && Number.isFinite(updatedTimestamp)
    ? new Date(updatedTimestamp).toISOString()
    : '';
  const options = { updatedAfter };
  // O cursor usa o relogio do backend, o mesmo que grava updated_at. Captura-lo
  // antes da consulta evita perder uma alteracao feita durante a requisicao.
  const cursor = new Date().toISOString();

  if (kind === 'received') {
    sendJson(request, response, 200, {
      orders: await dataStore.listReceivedOrders(currentStore.id, options),
      incremental: Boolean(updatedAfter),
      cursor
    });
    return true;
  }

  if (kind === 'sent') {
    sendJson(request, response, 200, {
      orders: await dataStore.listSentOrders(currentStore.id, options),
      incremental: Boolean(updatedAfter),
      cursor
    });
    return true;
  }

  return false;
};

const handleOrderById = async (request, response, orderId, action) => {
  const currentStore = await requireCurrentStore(request, response);
  if (!currentStore) return true;

  const order = await dataStore.getOrder(orderId);
  if (!ensureOrderAccess(request, order, currentStore, response)) return true;

  if (!action && request.method === 'GET') {
    sendJson(request, response, 200, { order, events: await dataStore.listOrderEvents(order.id) });
    return true;
  }

  if (action === 'events' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const type = String(body.type || '').trim();
    const message = String(body.message || '').trim();

    if (!type || !message) {
      sendError(request, response, 400, 'Informe tipo e mensagem do evento.');
      return true;
    }

    await dataStore.addOrderEvent(order.id, type, message);
    sendJson(request, response, 201, { events: await dataStore.listOrderEvents(order.id) });
    return true;
  }

  if (action === 'status' && request.method === 'PATCH') {
    const body = await readJsonBody(request);
    const nextStatus = String(body.status || '').trim();
    const version = getVersionFromBody(body);

    if (!version) {
      sendOrderVersionConflict(request, response, { order });
      return true;
    }

    if (nextStatus === ORDER_STATUS.VIEWED) {
      if (order.targetStoreId !== currentStore.id) {
        sendError(request, response, 403, 'Apenas a loja destino pode marcar o pedido como visto.');
        return true;
      }
      sendJson(request, response, 200, { order: await dataStore.markOrderViewed(order.id, version) });
      return true;
    }

    if (nextStatus === ORDER_STATUS.PRINTED) {
      if (order.targetStoreId !== currentStore.id) {
        sendError(request, response, 403, 'Apenas a loja destino pode marcar o pedido como impresso.');
        return true;
      }
      sendJson(request, response, 200, { order: await dataStore.markOrderPrinted(order.id, version) });
      return true;
    }

    if (nextStatus === ORDER_STATUS.CANCELED) {
      sendJson(request, response, 200, { order: await dataStore.cancelOrder(order.id, version) });
      return true;
    }

    sendError(request, response, 400, 'Status de pedido invalido.');
    return true;
  }

  if (action === 'view' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const version = getVersionFromBody(body);
    if (order.targetStoreId !== currentStore.id) {
      sendError(request, response, 403, 'Apenas a loja destino pode marcar o pedido como visto.');
      return true;
    }
    if (!version) {
      sendOrderVersionConflict(request, response, { order });
      return true;
    }
    sendJson(request, response, 200, { order: await dataStore.markOrderViewed(order.id, version) });
    return true;
  }

  if (action === 'printed' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const version = getVersionFromBody(body);
    if (order.targetStoreId !== currentStore.id) {
      sendError(request, response, 403, 'Apenas a loja destino pode marcar o pedido como impresso.');
      return true;
    }
    if (!version) {
      sendOrderVersionConflict(request, response, { order });
      return true;
    }
    sendJson(request, response, 200, { order: await dataStore.markOrderPrinted(order.id, version) });
    return true;
  }

  if (action === 'cancel' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const version = getVersionFromBody(body);
    if (!version) {
      sendOrderVersionConflict(request, response, { order });
      return true;
    }
    sendJson(request, response, 200, { order: await dataStore.cancelOrder(order.id, version) });
    return true;
  }

  return false;
};

const handleRequest = async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, getJsonHeaders(request));
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  try {
    if (pathname === '/health') {
      sendJson(request, response, 200, { ok: true, orderStore: dataStore.mode });
      return;
    }

    if (pathname === '/api/order-relay/session' && await handleOrderRelaySession(request, response)) return;
    if (pathname === '/api/auth/login' && await handleAuthLogin(request, response)) return;
    if (pathname === '/api/auth/logout' && await handleAuthLogout(request, response)) return;
    if (pathname === '/api/setup/stores' && await handleSetupStores(request, response)) return;
    if (pathname === '/api/me' && await handleMe(request, response)) return;
    if (pathname === '/api/me/store' && await handleMyStore(request, response)) return;
    if (pathname === '/api/store-settings' && await handleStoreSettings(request, response)) return;

    if (pathname === '/api/stores' && request.method === 'GET') {
      const currentStore = await requireCurrentStore(request, response);
      if (!currentStore) return;
      sendJson(request, response, 200, { stores: await dataStore.listStores() });
      return;
    }

    if (pathname === '/api/stores/targets' && request.method === 'GET') {
      const currentStore = await requireCurrentStore(request, response);
      if (!currentStore) return;
      sendJson(request, response, 200, { stores: await dataStore.listAllowedTargets(currentStore.id) });
      return;
    }

    const connectionMatch = pathname.match(/^\/api\/connections\/([^/]+)$/);
    if (connectionMatch && await handleConnection(request, response, decodeURIComponent(connectionMatch[1]))) return;

    if (pathname === '/api/orders/parse-route' && await handleParseRoute(request, response)) return;
    if (pathname === '/api/orders' && await handleCreateOrder(request, response)) return;
    if (pathname === '/api/orders/received' && await handleOrdersCollection(request, response, 'received', url)) return;
    if (pathname === '/api/orders/sent' && await handleOrdersCollection(request, response, 'sent', url)) return;

    const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)(?:\/([^/]+))?$/);
    if (orderMatch && await handleOrderById(
      request,
      response,
      decodeURIComponent(orderMatch[1]),
      orderMatch[2] ? decodeURIComponent(orderMatch[2]) : ''
    )) return;

    sendError(request, response, 404, 'Rota nao encontrada.');
  } catch (error) {
    console.error(error);
    if (error.code === 'ORDER_VERSION_CONFLICT') {
      sendOrderVersionConflict(request, response, error);
      return;
    }
    if (error.code === 'OPERATIONAL_DATA_RESET') {
      sendError(request, response, 409, error.message, {
        code: error.code,
        operationalCleanupAt: error.operationalCleanupAt || ''
      });
      return;
    }
    sendError(request, response, error.statusCode || 500, error.message || 'Erro interno.');
  }
};

const server = http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log(`Routing API pronta em http://${HOST}:${PORT} usando ${dataStore.mode}`);
});
