import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './lib/database.js';
import * as repository from './lib/repository.js';
import { parseIfoodOrder, routeOrder } from './lib/routing-core.js';
import { INITIAL_STORES } from './lib/seed-data.js';

const samplePenha = `6391
ricardo dom

PIZZA PARK
PIZZA PARK
Localizador 6874 6115
Entrega prevista:19:55

Av. Eugênio Krause, 3650 - Armação - Penha●88385000
Apto 303A
Entrega própria

Itens no pedido
Pizza 35cm (8 Fatias)
R$ 47,99
1
Americana
R$ 0,00`;

const sampleReview = `7000
Cliente Teste

PIZZA PARK
PIZZA PARK

Rua Exemplo, 100 - Santa Lídia - Penha 88385000
Casa
Itens no pedido
Pizza
R$ 40,00`;

const samplePaidOnline = `8000
Cliente Pago

PIZZA PARK
PIZZA PARK

Rua Exemplo, 100 - Centro Penha - Penha 88385000
Itens no pedido
Pizza 35cm
R$ 50,00
1
Taxa de entrega
R$ 5,00
Subtotal
R$ 55,00
Pago via iFood
Carteira digital
R$ 55,00
iFood ja recebeu esse valor`;

const parsedPenha = parseIfoodOrder(samplePenha);
assert.equal(parsedPenha.orderNumber, '6391');
assert.equal(parsedPenha.customerName, 'ricardo dom');
assert.equal(parsedPenha.address.neighborhood, 'Armação');
assert.equal(parsedPenha.address.number, '3650');
assert.equal(parsedPenha.items[0].name, 'Pizza 35cm (8 Fatias)');

const penhaRoute = routeOrder(parsedPenha, INITIAL_STORES);
assert.equal(penhaRoute.suggestedStoreId, 'penha');
assert.equal(penhaRoute.requiresReview, false);
assert.equal(penhaRoute.confidence, 'high');

const reviewRoute = routeOrder(parseIfoodOrder(sampleReview), INITIAL_STORES);
assert.equal(reviewRoute.suggestedStoreId, 'gravata');
assert.equal(reviewRoute.requiresReview, true);

const paidOnline = parseIfoodOrder(samplePaidOnline);
assert.equal(paidOnline.financial.paymentMethod, 'online');
assert.equal(paidOnline.financial.deductionValue, 55);

const manualRoute = routeOrder(parseIfoodOrder('1\nCliente\nLoja\nRua Sem Cadastro, 99 - Bairro Novo - Cidade'), INITIAL_STORES);
assert.equal(manualRoute.suggestedStoreId, null);
assert.equal(manualRoute.confidence, 'manual');

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
migrate(db);
repository.seedInitialData(db);

const duplicateInput = {
  rawText: samplePaidOnline,
  parsedData: paidOnline,
  routeResult: routeOrder(paidOnline, INITIAL_STORES),
  sourceStoreId: 'penha',
  targetStoreId: 'gravata'
};
const firstOrder = repository.createOrder(db, duplicateInput);
const secondOrder = repository.createOrder(db, duplicateInput);
const sentOrders = repository.listSentOrders(db, 'penha');

assert.equal(firstOrder.id, secondOrder.id);
assert.equal(secondOrder.status, 'reenviado');
assert.equal(secondOrder.isResend, true);
assert.equal(firstOrder.version, 1);
assert.equal(secondOrder.version, 2);
assert.equal(sentOrders.length, 1);

const printedOrder = repository.markOrderPrinted(db, secondOrder.id, secondOrder.version);
assert.equal(printedOrder.status, 'impresso');
assert.equal(printedOrder.version, 3);
assert.throws(
  () => repository.cancelOrder(db, secondOrder.id, secondOrder.version),
  (error) => error?.statusCode === 409 && error?.code === 'ORDER_VERSION_CONFLICT'
);

console.log('routing.test.js OK');
