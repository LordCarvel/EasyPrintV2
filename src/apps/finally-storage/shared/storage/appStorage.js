const APP_STATE_KEY = 'finallyStorageAppState';
const PREVIEW_IMAGE_KEY = 'finallyStoragePreviewImage';

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const readJson = (key, fallback) => {
  if (!canUseStorage()) return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`Falha ao ler ${key} do localStorage`, error);
    return fallback;
  }
};

const writeJson = (key, value) => {
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Falha ao salvar ${key} no localStorage`, error);
  }
};

export const loadAppState = () => readJson(APP_STATE_KEY, null);

export const saveAppState = (state) => {
  writeJson(APP_STATE_KEY, state);
};

export const loadPreviewImage = () => readJson(PREVIEW_IMAGE_KEY, {
  dataUrl: '',
  generatedAt: ''
});

export const savePreviewImage = (preview) => {
  writeJson(PREVIEW_IMAGE_KEY, preview);
};
