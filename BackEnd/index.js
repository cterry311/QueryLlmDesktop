const fs = require('fs');
const path = require('path');
const express = require('express');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (m) process.env[m[1]] = m[2];
    }
}

const { chat, getOpenrouterModels } = require('./llmClient');

const app = express();
app.use(express.json());

let context = []

app.post('/chat', async (req, res) => {
    try {
        const message = req.body?.message;
        const model = req.body?.model;
        if (typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'message is required' });
        }
        context.push({ role: 'user', content: message });
        const reply = await chat(context, model);
        context.push({ role: 'assistant', content: reply });
        res.json({ reply });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/models', async (_req, res) => {
    try {
        const models = await getOpenrouterModels();
        res.json({ models });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT}`));