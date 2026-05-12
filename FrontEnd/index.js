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
async function sendToLLM(message, options = {}) {
    // Example of what a real call might look like:
    //
    // const res = await fetch('https://api.example.com/v1/chat', {
    //     method: 'POST',
    //     headers: {
    //         'Content-Type': 'application/json',
    //         'Authorization': `Bearer ${process.env.LLM_API_KEY}`
    //     },
    //     body: JSON.stringify({
    //         model: options.model ?? 'default-model',
    //         messages: [{ role: 'user', content: message }]
    //     })
    // })
    // const data = await res.json()
    // return data.choices[0].message.content

    // Dummy response for now:
    return `(dummy response) You said: "${message}"`
}

ipcMain.handle('llm:send', async (_event, message, options) => {
    try {
        return { ok: true, reply: await sendToLLM(message, options) }
    } catch (err) {
        return { ok: false, error: err.message }
    }
})