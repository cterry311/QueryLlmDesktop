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

const { chat, getOpenrouterModels, getTitle } = require('./llmClient');
const { callModel } = require('./agentOrchestrator');
const sqlDal = require('./dal/sqlDal.js');

const app = express();
app.use(express.json());

let currentConversationId = 0;



/*
app.post('/chat', async (req, res) => {
    try {
        const message = req.body?.message;
        const model = req.body?.model;
        const routeId = req.body?.routeId;
        const stream = req.body?.stream ?? false;
        const newConversation = req.body?.newConversation === true;

        if (typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'message is required' });
        }

        if (newConversation) {
            currentConversationId = sqlDal.addConversation("temp", null);
        }
        sqlDal.pushMessage({content: message, role: 'user'}, currentConversationId, null)
        const context = sqlDal.getConversationById(currentConversationId);

        console.log("routeId: " + routeId)
        const providerInfo = sqlDal.getProviderById(routeId)
        console.log("providerInfo: " + JSON.stringify(providerInfo))
        const route = providerInfo.url
        const key = providerInfo.api_key



        let conversationMeta = null;
        if (newConversation) {
            conversationMeta = {
                conversationId: currentConversationId,
                conversationTitle: "temp"
            };
            // let conversationId = sqlDal.addConversation(buildDummyTitle(message), null)
            // conversationMeta = sqlDal.getConversationById(conversationId)
        }

        console.log("route before chat: " + route)

        if (!stream) {
            const reply = await chat(context, model, route, key, false);

            sqlDal.pushMessage({content: reply, role: 'assistant'}, currentConversationId, null)
            if (conversationMeta) {
                const fullContext = sqlDal.getConversationById(currentConversationId)
                const title = await getTitle(fullContext, model, route, key)
                sqlDal.updateConversationTitle(conversationMeta.conversationId, title);
                conversationMeta.conversationTitle = title;
            }
            return res.json({ reply, ...(conversationMeta || {}) });
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
        sqlDal.pushMessage({content: fullReply, role: 'assistant'}, currentConversationId, null)

        if (conversationMeta) {
            const fullContext = sqlDal.getConversationById(currentConversationId)
            conversationMeta.conversationTitle = await getTitle(fullContext, model, route, key)
            sqlDal.updateConversationTitle(conversationMeta.conversationId, conversationMeta.conversationTitle);
            res.write(`data: ${JSON.stringify({ meta: conversationMeta })}\n\n`);
        }
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
*/

app.post('/chat', async (req, res) => {
    try {
        const message = req.body?.message;
        const model = req.body?.model;
        const routeId = req.body?.routeId;
        const newConversation = req.body?.newConversation === true;

        if (typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'message is required' });
        }

        if (newConversation) {
            currentConversationId = sqlDal.addConversation("temp", null);
        }
        sqlDal.pushMessage({ content: message, role: 'user' }, currentConversationId, null);
        const context = sqlDal.getConversationById(currentConversationId);

        const providerInfo = sqlDal.getProviderById(routeId);
        const route = providerInfo.url;
        const key = providerInfo.api_key;

        let conversationMeta = null;
        if (newConversation) {
            conversationMeta = {
                conversationId: currentConversationId,
                conversationTitle: "temp"
            };
        }

        // SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const generator = callModel(context, model, route, key);
        let fullReply = '';

        for await (const chunk of generator) {
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
                fullReply += content;
                res.write(`data: ${JSON.stringify({ chunk: content })}\n\n`);
            }
        }

        sqlDal.pushMessage({ content: fullReply, role: 'assistant' }, currentConversationId, null);

        if (conversationMeta) {
            const fullContext = sqlDal.getConversationById(currentConversationId);
            conversationMeta.conversationTitle = await getTitle(fullContext, model, route, key);
            sqlDal.updateConversationTitle(conversationMeta.conversationId, conversationMeta.conversationTitle);
            res.write(`data: ${JSON.stringify({ meta: conversationMeta })}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        console.log("finished streaming")
        res.end();

    } catch (err) {
        console.error(err);
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
        console.log("getting models")
        const models = await getOpenrouterModels();
        for (let i = 0; i < models.length; i++) {
            models[i].routeId = 0
        }
        const addedRoutes = sqlDal.getModels()
        console.log("addedRoutes: " + JSON.stringify(addedRoutes, null, 2))
        for (let i = 0; i < addedRoutes.length; i++) {
            const newModel = {
                id: addedRoutes[i].model_id,
                name: addedRoutes[i].model_id,
                description: "",
                isFree: false,
                routeId: addedRoutes[i].provider_id
            }
            models.push(newModel)
            // const route = addedRoutes[i]
            // for (let j = 0; j < route.models.length; j++) {
            //     const newModel = {
            //         id: route.models[j],
            //         name: route.models[j],
            //         description: "",
            //         isFree: false,
            //         routeId: route.routeId
            //     }
            //     models.push(newModel)
            // }
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
            const providerId = sqlDal.addProvider(models[i].url, models[i].key)
            for (const m of models[i].models) {
                sqlDal.addModel(m, providerId)
            }
        }
        console.log(JSON.stringify(models, null, 2))
        res.json({ ok: true })
    } catch (err) {
        console.log(err)
        console.log(JSON.stringify(req.body, null, 2))
        res.status(400).json({ error: err.message });
    }
})

app.get('/conversations', (_req, res) => {
    const conversations = sqlDal.getConversations();
    res.json({ conversations: conversations });
});

app.post('/conversations/messages', (req, res) => {
    const id = req.body?.id;
    if (typeof id !== 'number') {
        return res.status(400).json({ error: 'id must be a number' });
    }
    const conversations = sqlDal.getConversations();
    const found = conversations.find(c => c.id === id);
    const title = found ? found.title : `Conversation ${id}`;
    const messages = sqlDal.getConversationById(id);
    currentConversationId = id;
    res.json({ id, title, messages });
});



sqlDal.setup()


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT}`));

// TODO: make the frontend send the modelId instead of model and routeId in chat requests
// TODO: make the frontend send the conversationID in the chat request