import { getCurrentStoreId, routingApi } from './routingApi';

const SETTINGS_OWNER_KEY = 'easyPrintSettingsOwnerStoreId';
const OPERATIONAL_CLEANUP_KEY = 'easyPrintOperationalCleanupAt';
const SETTINGS_CACHE_TTL_MS = 30 * 1000;
let settingsCache = null;
let settingsRequest = null;

const FIELD_MAP = {
  keywords: { key: 'keywords', empty: [] },
  catalogs: { key: 'catalogs', empty: [] },
  printTemplate: { key: 'template', empty: {} },
  cashOrders: { key: 'cashOrders', empty: [] },
  cashProcessed: { key: 'cashProcessed', empty: [] },
  deliveryBoardState: { key: 'deliveryBoardV2', empty: {} },
  finallyStorageState: { key: 'finallyStorageAppState', empty: {} }
};

const hasValue = (value) => {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return value !== undefined && value !== null && value !== '';
};

const dispatchSettingsUpdate = (settings) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('storeProfileSettingsUpdated', { detail: settings }));
};

export async function loadStoreSettings(options = {}) {
  const storeId = getCurrentStoreId();
  const now = Date.now();

  if (!options.force
      && settingsCache?.storeId === storeId
      && settingsCache.expiresAt > now) {
    return settingsCache.settings;
  }

  if (!options.force && settingsRequest?.storeId === storeId) {
    return settingsRequest.promise;
  }

  const promise = routingApi.getSettings()
    .then((payload) => {
      const settings = payload.settings || {};
      settingsCache = {
        storeId,
        settings,
        expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS
      };
      return settings;
    })
    .finally(() => {
      if (settingsRequest?.promise === promise) settingsRequest = null;
    });

  settingsRequest = { storeId, promise };
  return promise;
}

export async function saveStoreSettingsPatch(patch) {
  const operationalCleanupAt = settingsCache?.settings?.operationalCleanupAt
    || localStorage.getItem(OPERATIONAL_CLEANUP_KEY)
    || '';
  let payload;

  try {
    payload = await routingApi.saveSettings({ ...patch, operationalCleanupAt });
  } catch (error) {
    if (error.status !== 409 || error.payload?.code !== 'OPERATIONAL_DATA_RESET') throw error;

    settingsCache = null;
    settingsRequest = null;
    const freshSettings = await loadStoreSettings({ force: true });
    applyStoreSettingsToLocalCache(freshSettings);
    window.dispatchEvent(new CustomEvent('easyprintOperationalDataReset', {
      detail: freshSettings
    }));
    window.setTimeout(() => window.location.reload(), 0);
    throw new Error('Os dados operacionais foram limpos. A tela sera recarregada.');
  }

  const settings = payload.settings || {};

  if (settingsCache?.storeId === getCurrentStoreId()) {
    settingsCache = {
      ...settingsCache,
      settings: { ...settingsCache.settings, ...settings },
      expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS
    };
  }

  mirrorSettingsToLocalStorage(settings, { allowEmpty: true });
  return settings;
}

export function mirrorSettingsToLocalStorage(settings = {}, options = {}) {
  const storeId = settings.storeId || getCurrentStoreId();
  if (storeId) {
    localStorage.setItem(SETTINGS_OWNER_KEY, storeId);
  }

  Object.entries(FIELD_MAP).forEach(([field, meta]) => {
    const value = settings[field];
    if (value === undefined) return;
    if (!options.allowEmpty && !hasValue(value)) return;
    localStorage.setItem(meta.key, JSON.stringify(value));
  });

  dispatchSettingsUpdate(settings);
}

function applyStoreSettingsToLocalCache(settings = {}) {
  const storeId = settings.storeId || getCurrentStoreId();
  const resolved = { ...settings };

  localStorage.setItem(OPERATIONAL_CLEANUP_KEY, settings.operationalCleanupAt || '');

  Object.entries(FIELD_MAP).forEach(([field, meta]) => {
    const remoteValue = settings[field] === undefined ? meta.empty : settings[field];
    localStorage.setItem(meta.key, JSON.stringify(remoteValue));
    resolved[field] = remoteValue;
  });

  if (storeId) {
    localStorage.setItem(SETTINGS_OWNER_KEY, storeId);
  }

  return resolved;
}

export async function hydrateLocalSettingsFromStore() {
  const settings = await loadStoreSettings();
  return applyStoreSettingsToLocalCache(settings);
}
