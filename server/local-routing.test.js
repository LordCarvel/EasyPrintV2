import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }
}

globalThis.window = { localStorage: new MemoryStorage() };

const { localRoutingApi, resetLocalRoutingDatabaseForTests } = await import(
  '../src/features/routing/localRoutingStore.js'
);

resetLocalRoutingDatabaseForTests();

const setup = await localRoutingApi.listSetupStores();
assert.equal(setup.stores.length, 3);

const penhaSession = await localRoutingApi.login({ username: 'penha', password: '1234' });
assert.equal(penhaSession.store.id, 'penha');
window.localStorage.setItem('easyPrintRoutingCurrentStoreId', 'penha');
window.localStorage.setItem('easyPrintRoutingSessionToken', penhaSession.token);

window.localStorage.setItem('easyPrintSettingsOwnerStoreId', 'penha');
window.localStorage.setItem('keywords', JSON.stringify([{ word: 'sem cebola' }]));
const importedSettings = await localRoutingApi.getSettings();
assert.deepEqual(importedSettings.settings.keywords, [{ word: 'sem cebola' }]);

const savedSettings = await localRoutingApi.saveSettings({
  printTemplate: { fontSize: 13 },
  finallyStoragePreview: { dataUrl: 'data:image/png;base64,nao-salvar' }
});
assert.deepEqual(savedSettings.settings.printTemplate, { fontSize: 13 });
assert.equal(Object.hasOwn(savedSettings.settings, 'finallyStoragePreview'), false);

const sampleOrder = `9001
Cliente Local

PIZZA PARK
PIZZA PARK

Rua Exemplo, 100 - Gravata - Navegantes 88375000
Itens no pedido
Pizza
R$ 50,00`;

const created = await localRoutingApi.createOrder({
  rawText: sampleOrder,
  targetStoreId: 'gravata',
  routeConfirmed: true
});
assert.equal(created.order.sourceStoreId, 'penha');
assert.equal(created.order.targetStoreId, 'gravata');
assert.equal((await localRoutingApi.listSentOrders()).orders.length, 1);

window.localStorage.setItem('easyPrintRoutingCurrentStoreId', 'gravata');
const received = await localRoutingApi.listReceivedOrders();
assert.equal(received.orders.length, 1);
assert.equal(received.orders[0].id, created.order.id);

const printed = await localRoutingApi.markPrinted(created.order.id, received.orders[0].version);
assert.equal(printed.order.status, 'impresso');

window.localStorage.setItem('easyPrintRoutingCurrentStoreId', 'penha');
const sentChanges = await localRoutingApi.listSentOrders({
  updatedAfter: new Date(Date.now() - 60_000).toISOString()
});
assert.equal(sentChanges.incremental, true);
assert.equal(sentChanges.orders[0].status, 'impresso');

console.log('local-routing.test.js OK');
