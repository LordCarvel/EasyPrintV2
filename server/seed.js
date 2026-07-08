import { createDataStore } from './lib/data-store.js';

const dataStore = await createDataStore();
const stores = await dataStore.listStores();

for (const store of stores) {
  await dataStore.connectStoreToAll(store.id);
}

console.log(`Seed concluido com ${stores.length} loja(s) usando ${dataStore.mode}.`);
