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
    const providerId = db.prepare(`
        INSERT INTO providers (url, api_key, created_at, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(url, apiKey).lastInsertRowid;
    return providerId;
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




exports.getConversationById = getConversationById;
exports.setup = setup;
exports.addConversation = addConversation;
exports.pushMessage = pushMessage;
