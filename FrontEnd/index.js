const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

function createWindow() {
    const win = new BrowserWindow({
        width: 900,
        height: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    })
    win.loadFile('index.html')
    win.webContents.openDevTools() // remove this when done developing
}

app.whenReady().then(createWindow)


const BACKEND_URL = 'http://localhost:3000'

async function sendToLLM(message, model, routeId, onChunk) {
    const res = await fetch(`${BACKEND_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, model, routeId, stream: !!onChunk })
    });

    if (!onChunk) {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Backend error ${res.status}`);
        return data.reply;
    }

    if (!res.ok) throw new Error(`Backend error ${res.status}`);

    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
        const lines = decoder.decode(chunk).split('\n');
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') return;
            try {
                const parsed = JSON.parse(data);
                if (parsed.error) throw new Error(parsed.error);
                if (parsed.chunk) onChunk(parsed.chunk);
            } catch { }
        }
    }
}

async function listModels() {
    const res = await fetch(`${BACKEND_URL}/models`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `Backend error ${res.status}`)
    return data.models
}

ipcMain.handle('llm:send', async (_event, message, model, routeId) => {
    try {
        return { ok: true, reply: await sendToLLM(message, model, routeId) }
    } catch (err) {
        return { ok: false, error: err.message }
    }
});

// New streaming handler — sends chunks as events back to the renderer
ipcMain.handle('llm:stream', async (event, message, model, routeId) => {
    try {
        await sendToLLM(message, model, routeId, (chunk) => {
            event.sender.send('llm:chunk', chunk);
        });
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