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

async function sendToLLM(message) {
    const res = await fetch(`${BACKEND_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `Backend error ${res.status}`)
    return data.reply
}

ipcMain.handle('llm:send', async (_event, message, options) => {
    try {
        return { ok: true, reply: await sendToLLM(message, options) }
    } catch (err) {
        return { ok: false, error: err.message }
    }
})