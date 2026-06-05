const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')

/**
 * Creates the electron window
 */
function createWindow() {
    const win = new BrowserWindow({
        width: 1100,
        height: 750,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    })
    win.loadFile('index.html')
    win.webContents.openDevTools() // remove this when done developing
    win.on('closed', async () => {
        await fetch(`${BACKEND_URL}/shutdown`)
        console.log("Frontend Shutting Down")
        process.exit(0)
    })
}

app.whenReady().then(createWindow)


const BACKEND_URL = 'http://localhost:3000'

/**
 * sends a message to the LLM, either in a non-streaming or streaming fashion
 * @param message{string} the message to send
 * @param model{string} the model to send the message to
 * @param routeId{bigint} the id of the route to send the message to
 * @param newConversation{boolean} whether or not to start a new conversation
 * @param directory{string|null} the directory to save the conversation to, if any
 * @param addedContext{Array[bigint]} an array of additional conversationIds to to add to the conversation context
 * @param onChunk{function(string)} a function to executed when a chunk of the response is received
 * @param onMeta{function(string)} a function to executed when the meta data of the response is received
 * @param onPermission{function(string)} a function to executed when a permission request is received
 * @param onBlurb{function(string)} a function to be called when a tool call is received
 * @returns {Promise<*>}
 */
async function sendToLLM(message, model, routeId, newConversation, directory, addedContext, onChunk, onMeta, onPermission, onBlurb) {
    const res = await fetch(`${BACKEND_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message,
            model,
            routeId,
            addedContext,
            newConversation: !!newConversation,
            directory: directory || null,
            stream: !!onChunk
        })
    });

    if (!onChunk) {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Backend error ${res.status}`);
        if (onMeta && data.conversationId !== undefined) {
            onMeta({ conversationId: data.conversationId, conversationTitle: data.conversationTitle });
        }
        return data.reply;
    }

    if (!res.ok) throw new Error(`Backend error ${res.status}`);

    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') return;
            try {
                const parsed = JSON.parse(data);
                if (parsed.error) throw new Error(parsed.error);
                if (parsed.chunk) onChunk(parsed.chunk);
                if (parsed.meta && onMeta) onMeta(parsed.meta);
                if (parsed.permission && onPermission) onPermission(parsed.permission);
                if (parsed.tool_blurb && onBlurb) onBlurb(parsed.tool_blurb);
            } catch { }
        }
    }
}

/**
 * gets a list of all the models availible to choose from
 * @returns {Promise<*>}
 */
async function listModels() {
    const res = await fetch(`${BACKEND_URL}/models`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `Backend error ${res.status}`)
    return data.models
}

/**
 * gets a list of all the conversations
 * @returns {Promise<*|Record<string, SQLOutputValue>[]>}
 */
async function listConversations() {
    const res = await fetch(`${BACKEND_URL}/conversations`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `Backend error ${res.status}`)
    return data.conversations
}

/**
 * gets an array of all the messages in a conversation in the openAI format
 * @param id{ bigint} the id of the conversation to get the messages of
 * @returns {Promise<any>}
 */
async function getConversationMessages(id) {
    const res = await fetch(`${BACKEND_URL}/conversations/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `Backend error ${res.status}`)
    return data
}

/**
 * sends a permission decision to the backend
 * @param id{string} the id of the permission request
 * @param decision{string} the decision to make, either "allow" or "deny"
 * @returns {Promise<any>}
 */
async function sendPermissionDecision(id, decision) {
    const res = await fetch(`${BACKEND_URL}/permission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `Backend error ${res.status}`)
    return data
}

/**
 * gets the memory of the LLM, given a prompt
 * @param message{string} the message to match memories against
 * @returns {Promise<[]|*|AuthenticationExtensionsPRFValues|*[]|*[]>}
 */
async function getMemory(message) {
    const res = await fetch(`${BACKEND_URL}/getMemory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
    })
    if (!res.ok) {
        console.error('Failed to get memory:', res.statusText)
        return []
    }
    const data = await res.json()
    return data.results || []
}

ipcMain.handle('llm:send', async (_event, message, model, routeId, newConversation, directory) => {
    try {
        return { ok: true, reply: await sendToLLM(message, model, routeId, newConversation, directory) }
    } catch (err) {
        return { ok: false, error: err.message }
    }
});

// New streaming handler — sends chunks as events back to the renderer
ipcMain.handle('llm:stream', async (event, message, model, routeId, newConversation, directory, addedContext) => {
    try {
        await sendToLLM(
            message,
            model,
            routeId,
            newConversation,
            directory,
            addedContext,
            (chunk) => { event.sender.send('llm:chunk', chunk); },
            (meta) => { event.sender.send('llm:meta', meta); },
            (perm) => { event.sender.send('llm:permission', perm); },
            (blurb) => { event.sender.send('llm:tool-blurb', blurb); }
        );
        event.sender.send('llm:done');
    } catch (err) {
        event.sender.send('llm:error', err.message);
    }
});

ipcMain.handle('llm:models', async () => {
    try {
        return { ok: true, models: await listModels() }
    } catch (err) {
        return { ok: false, error: err.message }
    }
})

// Received from the renderer when the user saves API Details in the settings
// panel. `config` shape:
ipcMain.handle('api:set-config', async (_event, config) => {
    console.log('api:set-config received:', JSON.stringify(config, null, 2))
    await fetch(`${BACKEND_URL}/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    })
    return { ok: true }
})

ipcMain.handle('conv:list', async () => {
    try {
        return { ok: true, conversations: await listConversations() }
    } catch (err) {
        return { ok: false, error: err.message }
    }
})

ipcMain.handle('conv:messages', async (_event, id) => {
    try {
        return { ok: true, ...(await getConversationMessages(id)) }
    } catch (err) {
        return { ok: false, error: err.message }
    }
})

ipcMain.handle('dialog:pick-directory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, {
        title: 'Select a directory for this conversation',
        properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { ok: true, directory: null }
    }
    return { ok: true, directory: result.filePaths[0] }
})

ipcMain.handle('permission:respond', async (_event, id, decision) => {
    try {
        await sendPermissionDecision(id, decision)
        return { ok: true }
    } catch (err) {
        return { ok: false, error: err.message }
    }
})

ipcMain.handle('memory:get', async (_event, prompt) => {
    try {
        return { ok: true, results: await getMemory(prompt) }
    } catch (err) {
        return { ok: false, error: err.message }
    }
})

