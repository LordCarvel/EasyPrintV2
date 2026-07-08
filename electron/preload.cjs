const { clipboard, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('easyHubDesktop', {
  readClipboard: () => clipboard.readText(),
  writeClipboard: (value) => clipboard.writeText(String(value ?? '')),
});
