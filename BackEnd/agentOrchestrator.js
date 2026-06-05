const crypto = require('crypto');
const { agentStream } = require('./llmClient');
const { tools, functionsById, TOOLS_REQUIRING_PERMISSION, clearContext, toolBlurbs} = require('./toolHandlers');
const sqlDal = require('./dal/sqlDal');

const permissionResolvers = new Map();

/**
 * Resolves a permission request by id
 * @param id{string} - The id of the permission request
 * @param decision{string} - The decision to make, either 'allow' or 'deny'
 * @returns {boolean} - True if the permission request was resolved, false otherwise
 */
function resolvePermission(id, decision) {
    const resolver = permissionResolvers.get(id);
    if (resolver) {
        permissionResolvers.delete(id);
        resolver(decision);
        return true;
    }
    return false;
}

/**
 * Calls the model with the given context in an agentic enviorment, it will yield it's streamed content from the model in addition to any permission requests or tools the model called
 * @param context{Array[Object]} - The context to pass to the model, should be in the format of [{ role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hi'}]
 * @param model{string} - the model to call
 * @param url{string} - the endpoint to call the model at
 * @param key{string} - the API key to be passed to the endpoint
 * @param conversationId{bigint} - the id of the conversation the models processes will be saved to
 * @param modelId{bigint} - the id of the model the conversation is using, this is used to save the conversation to the database
 * @param directory{string|null} - the working directory for the model to opperate in, if null, tool calls requiring directory will be automtically denyed
 * @param maxIterations{number} - the maximum number of iterations the model will make, if max_itterations is reached the model will stop making tool calls and be forced to make a final response
 * @returns {AsyncGenerator<{_type: string, tool: unknown, blurb: *}|{_type: string, id: `${string}-${string}-${string}-${string}-${string}`, tool: unknown, args: {}}|any, void, *>} - an async generator that yields the model's streamed content, permission requests, and tool calls'
 */
async function* callModel(context, model, url, key, conversationId, modelId, directory = null, maxIterations = 15) {

    console.log("context: " + JSON.stringify(context, null, 2))
    const messages = [
        {'role': 'system', 'content':'you are in an agentic environment, use the tools provided to help the user fulfill their request, ' +
                'use the memory tools to save relevant information about the user and the current conversation. ' +
                'each time you receive a response you should consider any important information that you or the user brought up, and depending on it\'s relevance it should be saved to long term or temporary memory.'
        },
        ...context
    ];
    console.log("messages: " + JSON.stringify(messages, null, 2))

    const toolCtx = { directory, conversationId };

    for (let i = 0; i < maxIterations; i++) {
        const finalIteration = i === maxIterations - 1;
        const usableTools = finalIteration ? [] : tools;
        const stream = agentStream(messages, model, url, key, usableTools);

        let finishReason = null;
        let assistantContent = '';
        const toolCallBuffers = {};

        for await (const chunk of stream) {
            const choice = chunk.choices?.[0];
            if (!choice) continue;

            if (choice.finish_reason) {
                finishReason = choice.finish_reason;
            }

            const delta = choice.delta;
            if (!delta) continue;

            if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                    if (!toolCallBuffers[tc.index]) {
                        toolCallBuffers[tc.index] = { id: tc.id, name: '', arguments: '' };
                    }
                    if (tc.function?.name) toolCallBuffers[tc.index].name += tc.function.name;
                    toolCallBuffers[tc.index].arguments += tc.function?.arguments ?? '';
                }
            }

            if (delta.content) {
                assistantContent += delta.content;
                yield chunk
            }
        }

        if (finishReason === 'tool_calls') {
            const toolCalls = Object.values(toolCallBuffers).map(tc => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.name, arguments: tc.arguments }
            }));

            messages.push({
                role: 'assistant',
                content: assistantContent || null,
                tool_calls: toolCalls
            });
            sqlDal.pushMessage({
                role: 'assistant',
                content: assistantContent || null,
                tool_calls: toolCalls
            }, conversationId, modelId)
            assistantContent = '';
            let first = true;

            for (const tc of toolCalls) {
                if (first) {
                    first = false;
                    const blurb = toolBlurbs[tc.function.name]
                    yield {
                        _type: 'tool_blurb',
                        tool: tc.function.name,
                        blurb: blurb
                    }
                }
                let args;
                try {
                    args = JSON.parse(tc.function.arguments || '{}');
                } catch (e) {
                    args = {};
                }

                let result;
                if (TOOLS_REQUIRING_PERMISSION.has(tc.function.name)) {
                    const permissionId = crypto.randomUUID();
                    const decisionPromise = new Promise((resolve) => {
                        permissionResolvers.set(permissionId, resolve);
                    });
                    yield {
                        _type: 'permission_request',
                        id: permissionId,
                        tool: tc.function.name,
                        args
                    };
                    const decision = await decisionPromise;
                    if (decision !== 'allow') {
                        result = { error: 'User denied this tool call.' };
                    } else if (typeof functionsById[tc.function.name] !== 'function') {
                        result = { error: `Unknown tool: ${tc.function.name}` };
                    } else {
                        result = await functionsById[tc.function.name](args, toolCtx);
                    }
                } else if (typeof functionsById[tc.function.name] !== 'function') {
                    result = { error: `Unknown tool: ${tc.function.name}` };
                } else {
                    result = await functionsById[tc.function.name](args, toolCtx);
                }

                messages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: typeof result === 'string' ? result : JSON.stringify(result)
                });
                sqlDal.pushMessage({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: typeof result === 'string' ? result : JSON.stringify(result)
                }, conversationId, modelId)
            }

        } else {
            messages.push({ role: 'assistant', content: assistantContent });
            sqlDal.pushMessage({
                role: 'assistant',
                content: assistantContent || null,
            }, conversationId, modelId)
            console.log("finished")
            //console.log("messages: " + JSON.stringify(messages, null, 2))
            return;
        }
    }
}

module.exports = { callModel, resolvePermission, clearContext };
