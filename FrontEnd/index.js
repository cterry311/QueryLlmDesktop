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

// ---------------------------------------------------------------------------
// LLM API hook
// ---------------------------------------------------------------------------
// Replace the body of sendToLLM with a real API call later (fetch to OpenAI,
// Anthropic, a local server, etc.). The renderer talks to this through the
// 'llm:send' IPC channel exposed by preload.js.
const BACKEND_URL = 'http://localhost:3000'

async function sendToLLM(message, model) {
    const res = await fetch(`${BACKEND_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, model })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `Backend error ${res.status}`)
    return data.reply
}

async function listModels() {
    const res = await fetch(`${BACKEND_URL}/models`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `Backend error ${res.status}`)
    return data.models
}

ipcMain.handle('llm:send', async (_event, message, model) => {
    try {
        return { ok: true, reply: await sendToLLM(message, model) }
    } catch (err) {
        return { ok: false, error: err.message }
    }
})

ipcMain.handle('llm:models', async () => {
    try {
        return { ok: true, models: await listModels() }
    } catch (err) {
        return { ok: false, error: err.message }
    }
})