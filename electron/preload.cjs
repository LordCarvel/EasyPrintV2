const { clipboard, contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('easyHubDesktop', {
  readClipboard: () => clipboard.readText(),
  writeClipboard: (value) => clipboard.writeText(String(value ?? '')),
  printHtml: (html) => ipcRenderer.invoke('easyhub:print-html', String(html ?? '')),
});
