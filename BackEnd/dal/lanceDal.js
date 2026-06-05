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

/**
 * gets the vector embedding of the provided text
 * @param text{string} the text to embed
 * @returns {Promise<Array[number]>} the embedding
 */
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

/**
 * pushes a new memory to the database
 * @param text{string} the text to be embedded and stored as the main content of the memory
 * @param additionalContext{Array[string]} additional context added to the memory not fit to be in the main content
 * @returns {Promise<{success: boolean}>} a promise that resolves to true if the memory was successfully pushed
 */
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
    return { success: true}
}

/**
 * gets the top n matching memories to the query
 * @param query{string} the text to match to the main content of the memories, will be embedded and compared to the stored vectors
 * @param numResults{number} the number of memories to return
 * @returns {Promise<*[]>} an array of memories that match the query, in order of similarity to the query
 */
async function getMemory(query, numResults) {
    const table = await memTable
    const embedding = await getEmbedding(query)
    const fullMemories = await table.search(embedding).limit(numResults).toArray()
    const onlyContent = []
    for (const memory of fullMemories) {
        const limitedMemory = {
            memoryId: memory.id,
            text: memory.text,
            context: memory.context
        }
        onlyContent.push(limitedMemory)
    }
    return onlyContent
}

/**
 * adds additional context to an existing memory
 * @param id{string} the id of the memory to add context to
 * @param newContext{Array[string]} the context to add, will be appended to the existing context of the memory
 * @returns {Promise<{success: boolean}|{error: string}>} a promise that resolves to true if the context was successfully added, or an error message if the memory was not found
 */
async function addContext(id, newContext) {
    // Query for the existing record
    const results = await memTable
        .query()
        .where(`id = '${id}'`)
        .toArray();

    if (results.length === 0) {
        return { error: "Record not found"}
    }

    const record = results[0];

    // Merge the new context into the existing one
    const updatedContext = [...record.context, ...newContext];

    // Update the record
    await memTable.update({
        where: `id = '${id}'`,
        values: { context: updatedContext, editedAt: Date.now() },
    });
    return { success: true };
}

/**
 * clears the context of an existing memory
 * @param id{string} the id of the memory to clear the context of
 * @returns {Promise<{success: boolean}|{error: string}>} a promise that resolves to true if the context was successfully cleared, or an error message if the memory was not found
 */
async function clearContext(id) {
    // Query for the existing record
    const results = await memTable
        .query()
        .where(`id = '${id}'`)
        .toArray();

    if (results.length === 0) {
        return { error: "Record not found"}
    }

    const record = results[0];

    // Update the record
    await memTable.update({
        where: `id = '${id}'`,
        values: { context: [], editedAt: Date.now() },
    });
    return { success: true };
}

/**
 * removes a memory from the database
 * @param id{string} the id of the memory to remove
 * @returns {Promise<{success: boolean}>} a promise that resolves to true if the memory was successfully removed
 */
async function removeMemory(id) {
    const table = await memTable
    await table.delete(`id = '${id}'`);
    return { success: true }
}

exports.pushMemory = pushMemory;
exports.getMemory = getMemory;
exports.addContext = addContext;
exports.clearContext = clearContext;
exports.removeMemory = removeMemory;