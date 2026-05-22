const { chat, agentStream } = require('./llmClient');
const { tools, functionsById } = require('./toolHandlers');
const sqlDal = require('./dal/sqlDal');

async function* callModel(context, model, url, key, conversationId, modelId, maxIterations = 15) {
    console.log("context: " + JSON.stringify(context, null, 2))
    const messages = [...context];
    console.log("messages: " + JSON.stringify(messages, null, 2))

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

            for (const tc of toolCalls) {
                const args = JSON.parse(tc.function.arguments);
                const result = await functionsById[tc.function.name](args);
                messages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: typeof result === 'string' ? result : JSON.stringify(result)
                });
            }

        } else {
            messages.push({ role: 'assistant', content: assistantContent });
            sqlDal.pushMessage({
                role: 'assistant',
                content: assistantContent || null,
            }, conversationId, modelId)
            console.log("finished")
            console.log("messages: " + JSON.stringify(messages, null, 2))
            return;
        }
    }
}

module.exports = { callModel };