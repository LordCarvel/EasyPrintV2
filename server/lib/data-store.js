const methods = [
  'listStores',
  'getStore',
  'createStore',
  'updateStore',
  'loginStore',
  'getSessionStore',
  'logoutSession',
  'getStoreSettings',
  'updateStoreSettings',
  'listConnectionsFrom',
  'listAllowedTargets',
  'canSendToStore',
  'upsertConnection',
  'createOrder',
  'getOrder',
  'listReceivedOrders',
  'listSentOrders',
  'markOrderViewed',
  'markOrderPrinted',
  'cancelOrder',
  'addOrderEvent',
  'listOrderEvents',
  'seedInitialData',
  'connectStoreToAll'
];

const hasSupabaseConfig = () =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const bindRepository = (repository, db, mode) => {
  const store = { mode };

  methods.forEach((method) => {
    store[method] = (...args) => repository[method](db, ...args);
  });

  return store;
};

export const createDataStore = async () => {
  if (hasSupabaseConfig()) {
    const repository = await import('./repository-supabase.js');
    const db = repository.openDatabase();
    await repository.migrate(db);
    const store = bindRepository(repository, db, 'supabase');
    await store.seedInitialData();
    return store;
  }

  const database = await import('./database.js');
  const repository = await import('./repository.js');
  const db = database.openDatabase();
  database.migrate(db);
  const store = bindRepository(repository, db, 'sqlite');
  await store.seedInitialData();
  return store;
};
