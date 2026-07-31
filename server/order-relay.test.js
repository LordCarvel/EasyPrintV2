import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createOrderRelayAuth } from './lib/order-relay-auth.js';

const auth = createOrderRelayAuth({ secret: 'segredo-de-teste', ttlMs: 60_000 });
const validToken = auth.issue('penha');
assert.equal(auth.verify(validToken), 'penha');
assert.equal(auth.verify(`${validToken}alterado`), '');

const expiredAuth = createOrderRelayAuth({ secret: 'segredo-de-teste', ttlMs: -1 });
assert.equal(expiredAuth.verify(expiredAuth.issue('penha')), '');

const getFreePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    probe.close(() => resolve(address.port));
  });
});

const waitForServer = async (baseUrl, child) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Servidor encerrou com codigo ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return response.json();
    } catch {
      // Aguarda o processo abrir a porta.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Servidor de teste nao iniciou.');
};

const requestJson = async (baseUrl, pathname, { method = 'GET', token = '', body } = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Session-Token': token } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${payload.error || 'Falha na API'}`);
  return payload;
};

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'easyprint-order-relay-'));
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', './server/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    ROUTING_STORE_MODE: 'sqlite',
    ROUTING_DB_PATH: path.join(tempDir, 'orders.sqlite'),
    SUPABASE_URL: 'https://nao-deve-ser-usado.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'nao-deve-ser-usada'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverErrors = '';
child.stderr.on('data', (chunk) => {
  serverErrors += chunk.toString();
});

try {
  const health = await waitForServer(baseUrl, child);
  assert.equal(health.orderStore, 'sqlite');

  const penhaSession = await requestJson(baseUrl, '/api/order-relay/session', {
    method: 'POST',
    body: { storeId: 'penha' }
  });
  const gravataSession = await requestJson(baseUrl, '/api/order-relay/session', {
    method: 'POST',
    body: { storeId: 'gravata' }
  });

  const rawText = `9001
Cliente Compartilhado

PIZZA PARK
PIZZA PARK

Rua Teste, 100 - Gravata - Penha 88385000
Itens no pedido
Pizza
R$ 50,00`;

  const created = await requestJson(baseUrl, '/api/orders', {
    method: 'POST',
    token: penhaSession.token,
    body: { rawText, targetStoreId: 'gravata', routeConfirmed: true }
  });
  assert.equal(created.order.sourceStoreId, 'penha');
  assert.equal(created.order.targetStoreId, 'gravata');

  const received = await requestJson(baseUrl, '/api/orders/received', {
    token: gravataSession.token
  });
  assert.equal(received.orders.length, 1);
  assert.equal(received.orders[0].id, created.order.id);

  const printed = await requestJson(baseUrl, `/api/orders/${created.order.id}/printed`, {
    method: 'POST',
    token: gravataSession.token,
    body: { version: received.orders[0].version }
  });
  assert.equal(printed.order.status, 'impresso');

  const sent = await requestJson(baseUrl, '/api/orders/sent', {
    token: penhaSession.token
  });
  assert.equal(sent.orders[0].status, 'impresso');
} finally {
  child.kill();
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once('exit', resolve);
  });
  await rm(tempDir, { recursive: true, force: true });
}

if (serverErrors.trim()) {
  console.warn(serverErrors.trim());
}
console.log('order-relay.test.js OK');

