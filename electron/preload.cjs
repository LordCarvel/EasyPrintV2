const { clipboard, contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('easyHubDesktop', {
  readClipboard: () => clipboard.readText(),
  writeClipboard: (value) => clipboard.writeText(String(value ?? '')),
  printHtml: (html) => ipcRenderer.invoke('easyhub:print-html', String(html ?? '')),
  getAppInfo: () => ipcRenderer.invoke('easyhub:app-info'),
  updates: {
    getStatus: () => ipcRenderer.invoke('easyhub:update-status'),
    check: () => ipcRenderer.invoke('easyhub:update-check'),
    download: () => ipcRenderer.invoke('easyhub:update-download'),
    install: () => ipcRenderer.invoke('easyhub:update-install'),
    onStatus: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const listener = (_event, status) => callback(status);
      ipcRenderer.on('easyhub:update-status', listener);
      return () => ipcRenderer.removeListener('easyhub:update-status', listener);
    },
  },
});
