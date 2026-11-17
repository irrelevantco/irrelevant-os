const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("irrelevantSetup", {
  importEnvironment: () => ipcRenderer.invoke("import-environment"),
  connect: (config) => ipcRenderer.invoke("connect", config),
});
