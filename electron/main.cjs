const { app, BrowserWindow, ipcMain, net, protocol, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { shouldSkipUpdateCheck } = require('./updater-policy.cjs');

const APP_PROTOCOL = 'easyhub';
const APP_HOST = 'app';
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_UPDATE_CHECK_DELAY_MS = 15000;
const UPDATE_CHANNEL = 'easyhub:update-status';
let mainWindow = null;
let updateCheckTimer = null;
let updaterConfigured = false;
let updateCheckPromise = null;
let updateDownloadPromise = null;
let updateReady = false;
let lastLoggedDownloadPercent = -10;
let updateState = {
  status: 'idle',
  appVersion: app.getVersion(),
  availableVersion: '',
  releaseDate: '',
  percent: 0,
  message: '',
  supported: false,
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const localAppData = process.env.LOCALAPPDATA || app.getPath('appData');
const userDataPath = path.join(localAppData, 'EasyHub');
const cachePath = path.join(userDataPath, 'Cache');
const updaterLogPath = path.join(userDataPath, 'updater.log');

fs.mkdirSync(cachePath, { recursive: true });
app.setName('Easy Hub');
app.setPath('userData', userDataPath);
app.setPath('sessionData', path.join(userDataPath, 'Session'));
app.commandLine.appendSwitch('disk-cache-dir', cachePath);
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

function updateLogValue(value) {
  if (value instanceof Error) return `${value.message}\n${value.stack || ''}`.trim();
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function appendUpdaterLog(level, ...values) {
  try {
    const message = values.map(updateLogValue).join(' ');
    fs.appendFileSync(updaterLogPath, `${new Date().toISOString()} [${level}] ${message}\n`, 'utf8');
  } catch {
    // O diagnostico nunca pode impedir a abertura ou a atualizacao do app.
  }
}

const updaterLogger = {
  info: (...values) => appendUpdaterLog('INFO', ...values),
  warn: (...values) => appendUpdaterLog('WARN', ...values),
  error: (...values) => appendUpdaterLog('ERROR', ...values),
  debug: (...values) => appendUpdaterLog('DEBUG', ...values),
};

function canUseAutoUpdater() {
  return app.isPackaged && !process.env.ELECTRON_START_URL;
}

function serializeUpdateInfo(info) {
  if (!info) return {};
  return {
    availableVersion: info.version || '',
    releaseDate: info.releaseDate || '',
  };
}

function setUpdateState(patch = {}) {
  updateState = {
    ...updateState,
    ...patch,
    appVersion: app.getVersion(),
    supported: canUseAutoUpdater(),
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(UPDATE_CHANNEL, updateState);
  }

  return updateState;
}

function configureAutoUpdater() {
  if (updaterConfigured) return;
  updaterConfigured = true;
  autoUpdater.logger = updaterLogger;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  appendUpdaterLog('INFO', 'Atualizador configurado', { version: app.getVersion() });

  autoUpdater.on('checking-for-update', () => {
    if (updateReady) return;
    appendUpdaterLog('INFO', 'Verificando atualizacao');
    setUpdateState({
      status: 'checking',
      percent: 0,
      message: 'Verificando atualizacao...',
    });
  });

  autoUpdater.on('update-available', (info) => {
    if (updateReady && updateState.availableVersion === info?.version) return;
    appendUpdaterLog('INFO', 'Atualizacao encontrada', serializeUpdateInfo(info));
    setUpdateState({
      status: 'downloading',
      ...serializeUpdateInfo(info),
      percent: 0,
      message: 'Atualizacao encontrada. Iniciando download automatico...',
    });
  });

  autoUpdater.on('update-not-available', () => {
    if (updateReady) return;
    appendUpdaterLog('INFO', 'Nenhuma atualizacao disponivel');
    setUpdateState({
      status: 'not-available',
      availableVersion: '',
      releaseDate: '',
      percent: 0,
      message: 'Voce ja esta na versao mais recente.',
    });
  });

  autoUpdater.on('download-progress', (progress = {}) => {
    const percent = Number(progress.percent || 0);
    if (percent >= lastLoggedDownloadPercent + 10 || percent >= 100) {
      lastLoggedDownloadPercent = Math.floor(percent / 10) * 10;
      appendUpdaterLog('INFO', 'Progresso do download', { percent: Math.round(percent) });
    }
    setUpdateState({
      status: 'downloading',
      percent,
      message: 'Baixando atualizacao...',
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateReady = true;
    updateDownloadPromise = null;
    appendUpdaterLog('INFO', 'Atualizacao baixada', serializeUpdateInfo(info));
    setUpdateState({
      status: 'downloaded',
      ...serializeUpdateInfo(info),
      percent: 100,
      message: 'Atualizacao pronta para instalar.',
    });
  });

  autoUpdater.on('error', (error) => {
    updateDownloadPromise = null;
    appendUpdaterLog('ERROR', error);
    setUpdateState({
      status: 'error',
      message: error?.message || 'Falha ao verificar atualizacao.',
    });
  });
}

async function checkForUpdates({ silent = false } = {}) {
  if (!canUseAutoUpdater()) {
    return setUpdateState({
      status: 'unsupported',
      message: 'Atualizacoes automaticas funcionam apenas no app instalado.',
    });
  }

  configureAutoUpdater();
  if (updateCheckPromise) return updateCheckPromise;
  if (shouldSkipUpdateCheck(updateState.status, { scheduled: silent })) return updateState;

  updateCheckPromise = autoUpdater
    .checkForUpdates()
    .then(() => updateState)
    .catch((error) => {
      setUpdateState({
        status: 'error',
        message: error?.message || 'Falha ao verificar atualizacao.',
      });
      return updateState;
    })
    .finally(() => {
      updateCheckPromise = null;
    });

  return updateCheckPromise;
}

function startUpdateChecks() {
  if (!canUseAutoUpdater()) {
    setUpdateState({ supported: false });
    return;
  }

  configureAutoUpdater();
  setUpdateState({ supported: true });

  setTimeout(() => {
    void checkForUpdates({ silent: true });
  }, STARTUP_UPDATE_CHECK_DELAY_MS);

  if (!updateCheckTimer) {
    updateCheckTimer = setInterval(() => {
      void checkForUpdates({ silent: true });
    }, UPDATE_CHECK_INTERVAL_MS);
  }
}

function getDistDir() {
  return path.resolve(__dirname, '..', 'dist');
}

function resolveDistFile(requestUrl) {
  const distDir = getDistDir();
  const indexFile = path.join(distDir, 'index.html');
  const { hostname, pathname } = new URL(requestUrl);

  if (hostname !== APP_HOST) return indexFile;

  const decodedPath = decodeURIComponent(pathname);
  const relativePath = path.normalize(decodedPath).replace(/^([/\\])+/, '');
  const requestedFile = path.resolve(distDir, relativePath || 'index.html');
  const isInsideDist = requestedFile === distDir || requestedFile.startsWith(`${distDir}${path.sep}`);

  if (!isInsideDist) return indexFile;
  if (!fs.existsSync(requestedFile)) return indexFile;

  const stat = fs.statSync(requestedFile);
  return stat.isFile() ? requestedFile : indexFile;
}

function registerAppProtocol() {
  protocol.handle(APP_PROTOCOL, (request) => {
    const targetFile = resolveDistFile(request.url);
    return net.fetch(pathToFileURL(targetFile).toString());
  });
}

async function printHtmlSilently(html) {
  if (!String(html || '').trim()) {
    throw new Error('Conteudo de impressao vazio.');
  }

  const printWindow = new BrowserWindow({
    width: 320,
    height: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    await new Promise((resolve, reject) => {
      printWindow.webContents.print(
        {
          silent: true,
          printBackground: true,
        },
        (success, failureReason) => {
          if (success) {
            resolve();
          } else {
            reject(new Error(failureReason || 'Falha ao imprimir.'));
          }
        }
      );
    });
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.close();
    }
  }
}

ipcMain.handle('easyhub:print-html', async (_event, html) => {
  await printHtmlSilently(html);
  return { ok: true };
});

ipcMain.handle('easyhub:app-info', async () => ({
  version: app.getVersion(),
  isPackaged: app.isPackaged,
  updateSupported: canUseAutoUpdater(),
}));

ipcMain.handle('easyhub:update-status', async () => setUpdateState({}));

ipcMain.handle('easyhub:update-check', async () => checkForUpdates());

ipcMain.handle('easyhub:update-download', async () => {
  if (!canUseAutoUpdater()) {
    return setUpdateState({
      status: 'unsupported',
      message: 'Atualizacoes automaticas funcionam apenas no app instalado.',
    });
  }

  configureAutoUpdater();
  if (updateReady) return updateState;
  if (updateDownloadPromise) return updateDownloadPromise;
  setUpdateState({
    status: 'downloading',
    percent: 0,
    message: 'Baixando atualizacao...',
  });

  updateDownloadPromise = autoUpdater.downloadUpdate()
    .then(() => updateState)
    .catch((error) => {
      appendUpdaterLog('ERROR', error);
      setUpdateState({
        status: 'error',
        message: error?.message || 'Falha ao baixar atualizacao.',
      });
      return updateState;
    })
    .finally(() => {
      updateDownloadPromise = null;
    });

  return updateDownloadPromise;
});

ipcMain.handle('easyhub:update-install', async () => {
  if (!updateReady || updateState.status !== 'downloaded') {
    return setUpdateState({
      status: 'error',
      message: 'Nenhuma atualizacao baixada para instalar.',
    });
  }

  setUpdateState({
    status: 'installing',
    message: 'Reiniciando para instalar...',
  });
  appendUpdaterLog('INFO', 'Reiniciando para instalar', { version: updateState.availableVersion });
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return updateState;
});

async function getAppUrl() {
  if (process.env.ELECTRON_START_URL) {
    return process.env.ELECTRON_START_URL;
  }

  return `${APP_PROTOCOL}://${APP_HOST}/`;
}

async function createWindow() {
  const appUrl = await getAppUrl();
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: 'Easy Hub',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = window;

  window.once('ready-to-show', () => {
    window.show();
  });

  window.webContents.once('did-finish-load', () => {
    setUpdateState({});
  });

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await window.loadURL(appUrl);
}

app.whenReady().then(async () => {
  if (!process.env.ELECTRON_START_URL) {
    registerAppProtocol();
  }

  await createWindow();
  startUpdateChecks();
});

app.on('window-all-closed', () => {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
