const Database = require('better-sqlite3')

const db = new Database("sqlData/conversations.db")

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
}

function getConversationById(id) {
    const messages = db.prepare(`
        SELECT speaker_role as "role", content FROM messages
        WHERE conversation_id = ?
        ORDER BY message_order ASC
    `).all(id)
    return messages;
}


