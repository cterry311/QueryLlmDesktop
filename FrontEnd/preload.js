const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('llm', {
    send: (message, model) => ipcRenderer.invoke('llm:send', message, model),
    models: () => ipcRenderer.invoke('llm:models')
})