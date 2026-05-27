const lancedb = require("@lancedb/lancedb");
const path = require("path");
const fs = require("fs");
const e = require("express");


const db = lancedb.connect("./lance_data");
const memTable = db.then( async (db) => {
    const tableNames = await db.tableNames()
    const tableExists = tableNames.includes("memory")
    let table
    if (!tableExists) {
        console.log("creating table")
        const data = {
            id: crypto.randomUUID(),
            text: "example test",
            vector: await getEmbedding('example test'),
            createdAt: Date.now(),
            editedAt: Date.now(),
            context: ["nothing to see here", "this is a test memory to specify the schema of the table"]
        }
        table = db.createTable("memory", [data])
    } else {
        table = db.openTable("memory")
    }
    return table
})

async function getEmbedding(text) {
    const response = await fetch("http://localhost:12434/engines/llama.cpp/v1/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "ai/mxbai-embed-large",
            input: text,
        }),
    });
    if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}, model response: ${await response.text()}`);
    }
    const data = await response.json();
    return data.data[0].embedding;
}

async function pushMemory(text, additionalContext) {
    const table = await memTable;
    const record = {
        id: crypto.randomUUID(),
        text: text,
        vector: await getEmbedding(text),
        createdAt: Date.now(),
        editedAt: Date.now(),
        context: additionalContext
    }
    await table.add([record])
}

pushMemory("hello world", [])
