const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')


const dataDir = path.join(__dirname, 'sqlData')
fs.mkdirSync(dataDir, { recursive: true })

const db = new Database(path.join( dataDir, 'database.db'), { verbose: console.log })

function setup() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        directory TEXT NULL
      );
    
      CREATE TABLE IF NOT EXISTS providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );
    
      CREATE TABLE IF NOT EXISTS models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id TEXT NOT NULL,
        provider_id INTEGER NOT NULL,
        FOREIGN KEY (provider_id) REFERENCES providers(id)
      );
    
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_order INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        speaker_role TEXT NOT NULL,
        model_id INTEGER NULL,
        conversation_id INTEGER NOT NULL,
        FOREIGN KEY (model_id) REFERENCES models(id),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );
    `);

    const openRouterExists = db.prepare(`
    SELECT id
    FROM providers
    WHERE url = 'https://openrouter.ai/api/v1/chat/completions'
    `).get()
    if (!openRouterExists) {
        console.log("adding openrouter to providers table")
        db.prepare(`
        INSERT INTO providers (url, api_key, created_at, updated_at)
        VALUES ('https://openrouter.ai/api/v1/chat/completions', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(process.env.OPEN_ROUTER)
    }
}

function refreshOpenRouterModels(models) {
    console.log(JSON.stringify(models, null, 2))
    const openRouterId = db.prepare(`
        SELECT id
        FROM providers
        WHERE url = 'https://openrouter.ai/api/v1/chat/completions'
    `).get().id;
    db.prepare(`
        DELETE
        FROM models
        WHERE provider_id = ?
    `).run(openRouterId);
    for (const model of models) {
        db.prepare(`
            INSERT INTO models (model_id, provider_id)
            VALUES (?, ?)
        `).run(model.id, openRouterId);
    }
}

function addProvider(url, apiKey) {
    const providerExists = db.prepare(`
    SELECT id
    FROM providers
    WHERE url = ? AND api_key = ?
    `).get(url, apiKey);
    if (providerExists) return providerExists.id;
    const providerId = db.prepare(`
        INSERT INTO providers (url, api_key, created_at, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(url, apiKey).lastInsertRowid;
    return providerId;
}

function addModel(modelId, providerId) {
    const modelExists = db.prepare(`
    SELECT id
    FROM models
    WHERE model_id = ? AND provider_id = ?
    `).get(modelId, providerId);
    if (modelExists) return modelExists.id;
    const id = db.prepare(`
        INSERT INTO models (model_id, provider_id)
        VALUES (?, ?)
    `).run(modelId, providerId).lastInsertRowid;
    db.prepare(`
    UPDATE providers
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`).run(providerId);
    return id;
}

function getModels(includeOpenRouter = false) {
    if (includeOpenRouter) {
        return db.prepare(`
        SELECT id, model_id, provider_id FROM models
        `).all();
    } else {
        return db.prepare(`
        SELECT id, model_id, provider_id 
        FROM models
        WHERE provider_id NOT IN (SELECT id FROM providers WHERE url = 'https://openrouter.ai/api/v1/chat/completions')
        `).all()
    }

}

function getConversationById(id) {
    const messages = db.prepare(`
        SELECT speaker_role as "role", content FROM messages
        WHERE conversation_id = ?
        ORDER BY message_order ASC
    `).all(id)
    return messages;
}

function addConversation(title, directory) {
    const conversationId = db.prepare(`
        INSERT INTO conversations (title, created_at, updated_at, directory)
        VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    `).run(title, directory).lastInsertRowid
    return conversationId;
}

function pushMessage(message, conversationId, modelId) {
    const role = message.role;
    const content = message.content;

    const messageOrder = db.prepare(`
    SELECT COUNT(*) + 1 AS "message_order"
    FROM messages
    WHERE conversation_id = ?
    `).get(conversationId).message_order;

    const messageId = db.prepare(`
    INSERT INTO messages (message_order, content, created_at, speaker_role, model_id, conversation_id)
    VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?)`
    ).run(messageOrder, content, role, modelId, conversationId).lastInsertRowid;

    db.prepare(`
    UPDATE conversations
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`).run(conversationId);
    return messageId;
}

function getConversations() {
    return db.prepare(`
    SELECT id, title FROM conversations
    ORDER BY updated_at DESC
    `).all();
}

function getProviderById(id) {
    if (id === 0) {
        return db.prepare(`
        SELECT url, api_key FROM providers
        WHERE url = 'https://openrouter.ai/api/v1/chat/completions'
        `).get()
    }
    return db.prepare(`
    SELECT url, api_key FROM providers
    WHERE id = ?
    `).get(id);
}

function updateConversationTitle(id, title) {
    console.log("updating conversation title")
    console.log(id)
    console.log(title)
    db.prepare(`
        UPDATE conversations
        SET updated_at = CURRENT_TIMESTAMP,
            title = ?
        WHERE id = ?
    `).run(title, id);
}




exports.getConversationById = getConversationById;
exports.setup = setup;
exports.addConversation = addConversation;
exports.pushMessage = pushMessage;
exports.addModel = addModel;
exports.getModels = getModels;
exports.addProvider = addProvider;
exports.refreshOpenRouterModels = refreshOpenRouterModels;
exports.getConversations = getConversations;
exports.getProviderById = getProviderById;
exports.updateConversationTitle = updateConversationTitle;