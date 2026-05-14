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

async function sendToLLM(message, model, routeId) {
    const res = await fetch(`${BACKEND_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, model, routeId })
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

ipcMain.handle('llm:send', async (_event, message, model, routeId) => {
    try {
        return { ok: true, reply: await sendToLLM(message, model, routeId) }
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