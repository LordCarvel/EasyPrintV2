const { app, BrowserWindow, net, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_PROTOCOL = 'easyhub';
const APP_HOST = 'app';

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

fs.mkdirSync(cachePath, { recursive: true });
app.setName('Easy Hub');
app.setPath('userData', userDataPath);
app.setPath('sessionData', path.join(userDataPath, 'Session'));
app.commandLine.appendSwitch('disk-cache-dir', cachePath);
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

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

  window.once('ready-to-show', () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await window.loadURL(appUrl);
}

app.whenReady().then(() => {
  if (!process.env.ELECTRON_START_URL) {
    registerAppProtocol();
  }

  return createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
