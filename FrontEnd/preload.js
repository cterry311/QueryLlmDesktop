const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('llm', {
    send: (message, model, routeId, newConversation, directory) =>
        ipcRenderer.invoke('llm:send', message, model, routeId, !!newConversation, directory || null),
    stream: (message, model, routeId, newConversation, directory) =>
        ipcRenderer.invoke('llm:stream', message, model, routeId, !!newConversation, directory || null),
    onChunk: (cb) => ipcRenderer.on('llm:chunk', (_e, chunk) => cb(chunk)),
    onMeta: (cb) => ipcRenderer.once('llm:meta', (_e, meta) => cb(meta)),
    onDone: (cb) => ipcRenderer.once('llm:done', cb),
    onError: (cb) => ipcRenderer.once('llm:error', (_e, err) => cb(err)),
    onPermissionRequest: (cb) => ipcRenderer.on('llm:permission', (_e, perm) => cb(perm)),
    respondPermission: (id, decision) => ipcRenderer.invoke('permission:respond', id, decision),
    // Important: clean up listeners between messages
    removeStreamListeners: () => {
        ipcRenderer.removeAllListeners('llm:chunk');
        ipcRenderer.removeAllListeners('llm:meta');
        ipcRenderer.removeAllListeners('llm:done');
        ipcRenderer.removeAllListeners('llm:error');
        ipcRenderer.removeAllListeners('llm:permission');
    },
    models: () => ipcRenderer.invoke('llm:models'),
    setApiConfig: (config) => ipcRenderer.invoke('api:set-config', config),
    listConversations: () => ipcRenderer.invoke('conv:list'),
    getConversationMessages: (id) => ipcRenderer.invoke('conv:messages', id),
    pickDirectory: () => ipcRenderer.invoke('dialog:pick-directory')
});
