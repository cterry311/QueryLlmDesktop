const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('llm', {
    send: (message, model, routeId) => ipcRenderer.invoke('llm:send', message, model, routeId),
    stream: (message, model, routeId) => ipcRenderer.invoke('llm:stream', message, model, routeId),
    onChunk: (cb) => ipcRenderer.on('llm:chunk', (_e, chunk) => cb(chunk)),
    onDone: (cb) => ipcRenderer.once('llm:done', cb),
    onError: (cb) => ipcRenderer.once('llm:error', (_e, err) => cb(err)),
    // Important: clean up listeners between messages
    removeStreamListeners: () => {
        ipcRenderer.removeAllListeners('llm:chunk');
        ipcRenderer.removeAllListeners('llm:done');
        ipcRenderer.removeAllListeners('llm:error');
    },
    models: () => ipcRenderer.invoke('llm:models'),
    setApiConfig: (config) => ipcRenderer.invoke('api:set-config', config)
});