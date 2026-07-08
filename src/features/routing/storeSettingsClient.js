import { getCurrentStoreId, routingApi } from './routingApi';

const SETTINGS_OWNER_KEY = 'easyPrintSettingsOwnerStoreId';

const FIELD_MAP = {
  keywords: { key: 'keywords', empty: [] },
  catalogs: { key: 'catalogs', empty: [] },
  printTemplate: { key: 'template', empty: {} },
  cashOrders: { key: 'cashOrders', empty: [] },
  cashProcessed: { key: 'cashProcessed', empty: [] },
  deliveryBoardState: { key: 'deliveryBoardV2', empty: {} },
  finallyStorageState: { key: 'finallyStorageAppState', empty: {} },
  finallyStoragePreview: { key: 'finallyStoragePreviewImage', empty: { dataUrl: '', generatedAt: '' } }
};

const parseStoredJson = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
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

export async function loadStoreSettings() {
  const payload = await routingApi.getSettings();
  return payload.settings || {};
}

export async function saveStoreSettingsPatch(patch) {
  const payload = await routingApi.saveSettings(patch);
  const settings = payload.settings || {};
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
  const previousOwner = localStorage.getItem(SETTINGS_OWNER_KEY);
  const canMigrateLocal = !previousOwner || previousOwner === storeId;
  const migrationPatch = {};
  const resolved = { ...settings };

  Object.entries(FIELD_MAP).forEach(([field, meta]) => {
    const remoteValue = settings[field] === undefined ? meta.empty : settings[field];
    const localValue = parseStoredJson(meta.key, meta.empty);

    if (hasValue(remoteValue)) {
      localStorage.setItem(meta.key, JSON.stringify(remoteValue));
      resolved[field] = remoteValue;
      return;
    }

    if (canMigrateLocal && hasValue(localValue)) {
      migrationPatch[field] = localValue;
      resolved[field] = localValue;
      return;
    }

    localStorage.setItem(meta.key, JSON.stringify(meta.empty));
    resolved[field] = meta.empty;
  });

  if (storeId) {
    localStorage.setItem(SETTINGS_OWNER_KEY, storeId);
  }

  return { resolved, migrationPatch };
}

export async function hydrateLocalSettingsFromStore() {
  const settings = await loadStoreSettings();
  const { resolved, migrationPatch } = applyStoreSettingsToLocalCache(settings);

  if (Object.keys(migrationPatch).length) {
    const payload = await routingApi.saveSettings(migrationPatch);
    const saved = payload.settings || { ...resolved, ...migrationPatch };
    mirrorSettingsToLocalStorage(saved, { allowEmpty: true });
    return saved;
  }

  return resolved;
}
