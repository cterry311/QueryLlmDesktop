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

let addedRoutes = []

app.post('/chat', async (req, res) => {
    try {
        const message = req.body?.message;
        const model = req.body?.model;
        const routeId = req.body?.routeId;
        const stream = req.body?.stream ?? false;

        if (typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'message is required' });
        }

        console.log("routeId: " + routeId)
        let route = null;
        let key = null;
        if (routeId !== 0 && routeId !== undefined) {
            for (let i = 0; i < addedRoutes.length; i++) {
                if (addedRoutes[i].routeId === routeId) {
                    route = addedRoutes[i].url
                    key = addedRoutes[i].key
                    console.log("route found: " + route)
                }
            }
        }

        context.push({ role: 'user', content: message });
        console.log("route before chat: " + route)

        if (!stream) {
            const reply = await chat(context, model, route, key, false);
            context.push({ role: 'assistant', content: reply });
            return res.json({ reply });
        }

        // SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const generator = await chat(context, model, route, key, true);
        let fullReply = '';

        for await (const chunk of generator) {
            fullReply += chunk;
            res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        }

        // Push the complete reply into context once done
        context.push({ role: 'assistant', content: fullReply });
        res.write('data: [DONE]\n\n');
        res.end();

    } catch (err) {
        console.error(err);
        // Can't change status code if we already started streaming
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        } else {
            res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
            res.end();
        }
    }
});

app.get('/models', async (_req, res) => {
    try {
        const models = await getOpenrouterModels();
        for (let i = 0; i < models.length; i++) {
            models[i].routeId = 0
        }
        for (let i = 0; i < addedRoutes.length; i++) {
            const route = addedRoutes[i]
            for (let j = 0; j < route.models.length; j++) {
                const newModel = {
                    id: route.models[j],
                    name: route.models[j],
                    description: "",
                    isFree: false,
                    routeId: route.routeId
                }
                models.push(newModel)
            }
        }
        res.json({ models });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/models', async (req, res) => {
    try {
        let models = req.body
        for (const model of models) {
            if (!(typeof model.url === 'string')) throw new Error("url is not a string")
            if (!(typeof model.key === 'string')) throw new Error("key is not a string")
            if (!((model.models) instanceof Array)) throw new Error("models is not an array")
            for (const m of model.models) {
                if (!(typeof m === 'string')) throw new Error("model is not a string")
            }
        }
        for (let i = 0; i < models.length; i++) {
            models[i].routeId = i + 1
        }
        addedRoutes = models
        console.log(JSON.stringify(addedRoutes, null, 2))
        res.json({ ok: true })
    } catch (err) {
        console.log(err)
        console.log(JSON.stringify(req.body, null, 2))
        res.status(400).json({ error: err.message });
    }
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT}`));