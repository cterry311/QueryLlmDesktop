const crypto = require('crypto');
const { agentStream } = require('./llmClient');
const { tools, functionsById, TOOLS_REQUIRING_PERMISSION, clearContext, toolBlurbs} = require('./toolHandlers');
const sqlDal = require('./dal/sqlDal');

const permissionResolvers = new Map();

function resolvePermission(id, decision) {
    const resolver = permissionResolvers.get(id);
    if (resolver) {
        permissionResolvers.delete(id);
        resolver(decision);
        return true;
    }
    return false;
}

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
