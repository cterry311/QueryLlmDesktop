const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('llm', {
    send: (message, model, routeId) => ipcRenderer.invoke('llm:send', message, model, routeId),
    models: () => ipcRenderer.invoke('llm:models'),
    setApiConfig: (config) => ipcRenderer.invoke('api:set-config', config)
})