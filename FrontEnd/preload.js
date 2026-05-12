const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('llm', {
    send: (message, options) => ipcRenderer.invoke('llm:send', message, options)
})