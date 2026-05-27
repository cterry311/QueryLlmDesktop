const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const lanceDal = require('./dal/lanceDal.js')


const NO_DIRECTORY_MESSAGE = "This tool is not available for use because no directory is attached to this conversation.";
const OUT_OF_SCOPE_MESSAGE = "The requested path is outside the conversation's selected directory and cannot be accessed.";

function resolveSafePath(rootDir, requested) {
    if (typeof requested !== 'string' || requested.length === 0) return null;
    const root = path.resolve(rootDir);
    const candidate = path.resolve(root, requested);
    if (candidate !== root && !candidate.startsWith(root + path.sep)) return null;
    return candidate;
}

async function buildTree(dir, base, depth, maxDepth, maxEntries, counter) {
    console.log(`depth ${depth} typeof depth ${typeof depth}, max depth ${maxDepth} typeof Maxdepth ${typeof maxDepth}`)
    if (depth > maxDepth) return { name: path.basename(dir), type: 'directory', truncated: true };
    let entries;
    try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (err) {
        return { name: path.basename(dir), type: 'directory', error: err.code || 'EREAD' };
    }
    const children = [];
    for (const entry of entries) {
        if (counter.count >= maxEntries) {
            children.push({ name: '...', type: 'truncated' });
            break;
        }
        if (entry.name === 'node_modules' || entry.name === '.git') {
            children.push({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file', skipped: true });
            counter.count++;
            continue;
        }
        const relPath = base ? `${base}/${entry.name}` : entry.name;
        counter.count++;
        if (entry.isDirectory()) {
            children.push(await buildTree(path.join(dir, entry.name), relPath, depth + 1, maxDepth, maxEntries, counter));
        } else {
            children.push({ name: entry.name, path: relPath, type: 'file' });
        }
    }
    return { name: path.basename(dir) || dir, path: base || '.', type: 'directory', children };
}

const processes = new Map();
const processesOutput = new Map();

const functionsById = {
    "execute_code_sandbox": async (args) => {
        const { code, language } = args;
        try {
            const response = await fetch("http://localhost:3002/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code, language })
            });
            return response.json();
        } catch (error) {
            console.error("Error executing code:", error);
            return { error: "Failed to execute code, it is probably your fault" };
        }
    },
    "web_search": async (args) => {
        let { query, freshness, summary, count } = args;
        try {
            if (typeof query !== 'string') return { error: 'query must be a string' };
            if (freshness && typeof freshness !== 'string') return { error: 'freshness must be a string' };
            if (!summary) summary = false;
            if (typeof summary !== 'boolean') return { error: 'summary must be a boolean' };
            if (!count) count = 3;
            if (typeof count !== 'number') return { error: 'count must be a number' };
            const response = await fetch("https://api.langsearch.com/v1/web-search", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.LANG_SEARCH}`
                },
                body: JSON.stringify({ query, freshness, summary, count })
            });
            return response.json();
        } catch (error) {
            console.error("Error executing code:", error);
            return { error: "Error when Fetching Result, possible malformed request" };
        }
    },
    "fetch_request": async (args) => {
        const { url, method, headers, body } = args;
        try {
            if (typeof url !== 'string') return { error: 'url must be a string' };
            const response = await fetch(url, { method, headers, body: JSON.stringify(body) });
            return response.text();
        } catch (error) {
            console.error("Error executing code:", error);
            return { error: "Fetch request failed, probably malformed request" };
        }
    },
    "scratchpad": async () => "ok",

    "list_directory": async (_args, ctx) => {
        if (!ctx || !ctx.directory) return { error: NO_DIRECTORY_MESSAGE };
        try {
            console.log("arguments" + JSON.stringify(_args, null, 2))
            if (!_args?.depth) {
                _args.depth = 0;
            }
            console.log("args depth " + _args.depth)
            if (typeof _args?.depth !== 'number') return { error: "depth must be a number" };
            const tree = await buildTree(ctx.directory, '', 0, _args.depth, 500, { count: 0 });
            return { root: ctx.directory, tree };
        } catch (err) {
            return { error: `Failed to list directory: ${err.message}` };
        }
    },

    "view_file": async (args, ctx) => {
        if (!ctx || !ctx.directory) return { error: NO_DIRECTORY_MESSAGE };
        const safe = resolveSafePath(ctx.directory, args?.path);
        if (!safe) return { error: OUT_OF_SCOPE_MESSAGE };
        try {
            const stat = await fsp.stat(safe);
            if (stat.isDirectory()) return { error: "Path refers to a directory, not a file." };
            if (stat.size > 1024 * 1024) return { error: "File is larger than 1MB and cannot be read." };
            const content = await fsp.readFile(safe, 'utf-8');
            return { path: args.path, content };
        } catch (err) {
            return { error: `Failed to read file: ${err.message}` };
        }
    },

    "edit_file": async (args, ctx) => {
        if (!ctx || !ctx.directory) return { error: NO_DIRECTORY_MESSAGE };
        const safe = resolveSafePath(ctx.directory, args?.path);
        if (!safe) return { error: OUT_OF_SCOPE_MESSAGE };
        if (typeof args?.content !== 'string') return { error: "content must be a string" };
        try {
            await fsp.mkdir(path.dirname(safe), { recursive: true });
            await fsp.writeFile(safe, args.content, 'utf-8');
            return { ok: true, path: args.path };
        } catch (err) {
            return { error: `Failed to write file: ${err.message}` };
        }
    },

    "execute_command": async (args, ctx) => {
        if (!ctx || !ctx.directory) return { error: NO_DIRECTORY_MESSAGE };
        if (typeof args?.command !== 'string' || !args.command.trim()) {
            return { error: "command must be a non-empty string" };
        }
        return await new Promise((resolve) => {
            const proc = spawn(
                'powershell.exe',
                ['-NoProfile', '-NonInteractive', '-Command', args.command],
                { cwd: ctx.directory }
            );
            let stdout = '';
            let stderr = '';
            const timeout = setTimeout(() => {
                try { proc.kill(); } catch (_) { /* ignore */ }
                resolve({ error: "Command timed out after 60 seconds.", stdout, stderr });
            }, 60_000);
            proc.stdout.on('data', d => { stdout += d.toString(); });
            proc.stderr.on('data', d => { stderr += d.toString(); });
            proc.on('error', (err) => {
                clearTimeout(timeout);
                resolve({ error: `Failed to spawn shell: ${err.message}` });
            });
            proc.on('close', (code) => {
                clearTimeout(timeout);
                resolve({ exitCode: code, stdout, stderr });
            });
        });
    },
    "spawn_process": async (args, ctx) => {
        if (!ctx || !ctx.directory) return { error: NO_DIRECTORY_MESSAGE };
        if (typeof args?.command !== 'string' || !args.command.trim()) {
            return { error: "command must be a non-empty string" };
        }
        if (typeof args?.processId !== 'string' || !args.processId.trim()) {
            return { error: "processId must be a non-empty string" };
        }
        const proc = spawn(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-Command', args.command],
            { cwd: ctx.directory }
        )
        const output = {stdout: '', stderr: ''};
        proc.stdout.on('data', d => { output.stdout += d.toString(); });
        proc.stderr.on('data', d => { output.stderr += d.toString(); });
        processes.set(args.processId, proc);
        processesOutput.set(args.processId, output);
        return { ok: true };
    },
    "kill_process": async (args, ctx) => {
        if (!ctx || !ctx.directory) return { error: NO_DIRECTORY_MESSAGE };
        if (!args?.processId) {
            processes.forEach(proc => proc.kill());
            processes.clear();
            return { ok: true };
        }
        if (typeof args?.processId !== 'string' || !args.processId.trim()) {
            return { error: "processId must be a non-empty string" };
        }
        const proc = processes.get(args.processId);
        if (!proc) return { error: "Process not found" };
        proc.kill();
        processes.delete(args.processId);
        processesOutput.delete(args.processId);
        return { ok: true };
    },
    "view_process": async (args, ctx) => {
        if (!ctx || !ctx.directory) return { error: NO_DIRECTORY_MESSAGE };
        if (typeof args?.processId !== 'string' || !args.processId.trim()) {
            return { error: "processId must be a non-empty string" };
        }
        const proc = processesOutput.get(args.processId);
        if (!proc) return { error: "Process not found" };
        return proc;
    },
    "get_process_list": async (args, ctx) => {
        if (!ctx || !ctx.directory) return { error: NO_DIRECTORY_MESSAGE };
        return Array.from(processes.keys());
    },
    "add_memory": async (args, ctx) => {
        let { memory, context } = args;
        if (!memory) {
            return { error: "memory must be provided" };
        }
        if (!context) {
            context = []
        }
        if (typeof memory !== 'string') {
            return { error: "memory must be a string" };
        }
        if (typeof context !== 'object' || !Array.isArray(context)) {
            return { error: "context must be an array" };
        }
        return await lanceDal.pushMemory(memory, context)
    },
    "get_memory": async (args, ctx) => {
        let { query, numResults } = args
        if (!query) {
            return { error: "query must be provided" };
        }
        if (!numResults) {
            numResults = 1
        }
        if (typeof query !== 'string') {
            return { error: "query must be a string" };
        }
        if (typeof numResults !== 'number') {
            return { error: "numResults must be a number" };
        }
        return await lanceDal.getMemory(query, numResults)
    },
    "add_memory_context": async (args, ctx) => {
        let { memoryId, context } = args;
        if (!memoryId) {
            return { error: "memory must be provided" };
        }
        if (!context) {
            return { error: "context must be provided" };
        }
        if (typeof memoryId !== 'string') {
            return { error: "memory must be a string" };
        }
        if (typeof context !== 'object' || !Array.isArray(context)) {
            return { error: "context must be an array" };
        }
        return await lanceDal.addContext(memoryId, context)
    },
    "clear_memory_context": async (args, ctx) => {
        let { memoryId } = args;
        if (!memoryId) {
            return { error: "memory must be provided" };
        }
        if (typeof memoryId !== 'string') {
            return { error: "memory must be a string" };
        }
        return await lanceDal.clearContext(memoryId)
    },
    "remove_memory": async (args, ctx) => {
        let { memoryId } = args;
        if (!memoryId) {
            return { error: "memory must be provided" };
        }
        if (typeof memoryId !== 'string') {
            return { error: "memory must be a string" };
        }
        return await lanceDal.removeMemory(memoryId)
    }
};


const tools = [
    {
        "type": "function",
        "function": {
            "name": "execute_code_sandbox",
            "description": "execute python or javascript code in an isolated environment, get the console output of the code",
            "parameters": {
                "type": "object",
                "required": ["code", "language"],
                "properties": {
                    "code": { "type": "string", "description": "the code to be executed" },
                    "language": { "type": "string", "description": "the language of the code to be executed, either 'python', or 'javascript'" }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "search the internet for information, return the results",
            "parameters": {
                "type": "object",
                "required": ["query"],
                "properties": {
                    "query": { "type": "string", "description": "the query to search for" },
                    "freshness": {
                        "type": "string",
                        "description": "Specifies the time range for search results. Possible values:\n" +
                            "- oneDay: Results from the past 24 hours.\n" +
                            "- oneWeek: Results from the past week.\n" +
                            "- oneMonth: Results from the past month.\n" +
                            "- oneYear: Results from the past year.\n" +
                            "- noLimit: No time filter (default)."
                    },
                    "summary": { "type": "boolean", "description": "whether to show a summary of each result in addition to a snippet and link. Warning, the summary can be quite long" },
                    "count": { "type": "number", "description": "the number of results to return possible range is 1-10" }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_request",
            "description": "make a fetch request to a url, return the response",
            "parameters": {
                "type": "object",
                "required": ["url"],
                "properties": {
                    "url": { "type": "string", "description": "the url to fetch from" },
                    "method": { "type": "string", "description": "the method to use for the fetch request, possible values are 'GET', 'POST', 'PUT', 'DELETE'" },
                    "headers": { "type": "object", "description": "the headers to send with the fetch request" },
                    "body": { "type": "object", "description": "the body of the fetch request" }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "scratchpad",
            "description": "Use this tool to think through a problem, plan your approach, or reason step by step before taking action. Thoughts are saved but not shown to the user.",
            "parameters": {
                "type": "object",
                "properties": {
                    "thoughts": { "type": "string", "description": "your internal thoughts, reasoning, or plan" }
                },
                "required": ["thoughts"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_directory",
            "description": "List the file and folder structure of the directory attached to this conversation. Returns a tree of files and folders relative to the conversation's directory. Returns an error if the conversation has no attached directory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "depth": { "type": "number", "description": "The depth of the directory tree to return. Defaults to 0, be aware that the output of this command can explode as depth increases." },
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "view_file",
            "description": "View the text content of a file inside the conversation's attached directory. The path must be a path relative to the conversation directory; paths outside the directory are rejected. Returns an error if the conversation has no attached directory.",
            "parameters": {
                "type": "object",
                "required": ["path"],
                "properties": {
                    "path": { "type": "string", "description": "Path of the file to view, relative to the conversation's directory." }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "edit_file",
            "description": "Create a new file or overwrite an existing file inside the conversation's attached directory with the provided text content. The user must confirm before the write occurs. The path must be relative to the conversation directory; paths outside the directory are rejected. Returns an error if the conversation has no attached directory or if the user denies the edit.",
            "parameters": {
                "type": "object",
                "required": ["path", "content"],
                "properties": {
                    "path": { "type": "string", "description": "Path of the file to create or overwrite, relative to the conversation's directory." },
                    "content": { "type": "string", "description": "The full text content to write to the file." }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "execute_command",
            "description": "Execute a PowerShell terminal command. The command is always run in the conversation's attached directory. The user must confirm before the command runs. Returns an error if the conversation has no attached directory or if the user denies the command.",
            "parameters": {
                "type": "object",
                "required": ["command"],
                "properties": {
                    "command": { "type": "string", "description": "The PowerShell command to execute." }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "spawn_process",
            "description": "Spawn a long running process. The process is always run in the conversation's attached directory. The user must confirm before the process is spawned. Returns an error if the conversation has no attached directory or if the user denies the process.",
            "parameters": {
                "type": "object",
                "required": ["command", "processId"],
                "properties": {
                    "command": { "type": "string", "description": "The command to spawn." },
                    "processId": { "type": "string", "description": "The id of the process." }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "kill_process",
            "description": "Kill a long running process. The process is always run in the conversation's attached directory. kills all processes if no processId is provided. Returns an error if the conversation has no attached directory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "processId": { "type": "string", "description": "The id of the process to kill." }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "view_process",
            "description": "View the output of a long running process. a processId is provided and will get the current console output of that process.",
            "parameters": {
                "type": "object",
                "required": ["processId"],
                "properties": {
                    "processId": { "type": "string", "description": "The id of the process to view." }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_process_list",
            "description": "Get the list of all process ids.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "add_memory",
            "description": "Add text to persistent memory, this memory is saved in vector database and can be fetched later based on vector similarity.",
            "parameters": {
                "type": "object",
                "required": ["memory"],
                "properties": {
                    "memory": { "type": "string", "description": "The text to add to memory." },
                    "context": { "type": "array", "description": "The context of the memory, this is optional and can be used to provide additional information about the memory. is an array of strings" }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_memory",
            "description": "Get text from persistent memory based on vector similarity.",
            "parameters": {
                "type": "object",
                "required": ["query"],
                "properties": {
                    "query": { "type": "string", "description": "The text to be embedded and searched for in memory" },
                    "numResults": { "type": "number", "description": "The number of results to return." }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "add_memory_context",
            "description": "Add context to a memory, this context is saved in vector database and can be fetched later based on vector similarity.",
            "parameters": {
                "type": "object",
                "required": ["memoryId", "context"],
                "properties": {
                    "memoryId": { "type": "string", "description": "The id of the memory to add context to." },
                    "context": { "type": "array", "description": "The context to add to the memory. is an array of strings" }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "clear_memory_context",
            "description": "Clear the context of a memory.",
            "parameters": {
                "type": "object",
                "required": ["memoryId"],
                "properties": {
                    "memoryId": { "type": "string", "description": "The id of the memory to clear context from." }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "remove_memory",
            "description": "Remove a memory from persistent memory.",
            "parameters": {
                "type": "object",
                "required": ["memoryId"],
                "properties": {
                    "memoryId": { "type": "string", "description": "The id of the memory to remove." }
                }
            }
        }
    }
];

function clearContext() {
    processes.forEach(proc => proc.kill());
    processes.clear();
    processesOutput.clear();
}

const TOOLS_REQUIRING_PERMISSION = new Set(['edit_file', 'execute_command', 'spawn_process']);

module.exports = { tools, functionsById, TOOLS_REQUIRING_PERMISSION, clearContext };
