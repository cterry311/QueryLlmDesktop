const openrouterURL = "https://openrouter.ai/api/v1/chat/completions"

const defaultModel = "openrouter/free"
const imageCapability = new Map()

/**
 * A custom error class for when the context window is exceeded
 */
class ContextSizeError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ContextLimitError';
    }
}

/**
 * Get a response from the LLM
 * @param context{Array[Object]} - The context of the conversation in the openAI format
 * @param model{string} - The model to use
 * @param route{string} - The route to use
 * @param key{string} - The key to use
 * @param stream{boolean} - Whether to stream the response or not
 * @returns {Promise<AsyncGenerator<string, void, *>|*>} - either a streamed response, or a promise that resolves to the response
 */
async function getResponse(context, model, route, key, stream = false) {
    if (containsImageContent(context)) {
        if (!(await isImageCapable(model, route, key))) {
            context = purgeImageContent(context)
        }
    }
    console.log("route: " + route)
    if (route === null) {
        route = openrouterURL
    }
    if (key === null) {
        key = process.env.OPEN_ROUTER
    }
    console.log("getting response from: " + route + " and model: " + model)

    const response = await fetch(route, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: model || defaultModel,
            messages: context,
            stream
        })
    });

    if (!response.ok) {
        throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
    }

    if (!stream) {
        const data = await response.json();
        console.log("data: " + JSON.stringify(data, null, 2))
        return data.choices[0].message.content;
    }

    // Return an async generator so the caller can iterate over chunks
    return (async function* () {
        const decoder = new TextDecoder();
        for await (const chunk of response.body) {
            const lines = decoder.decode(chunk).split('\n');
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6);
                if (data === '[DONE]') return;
                try {
                    const delta = JSON.parse(data).choices[0].delta.content ?? '';
                    if (delta) yield delta;
                } catch {
                    // malformed chunk, skip
                }
            }
        }
    })();
}

/**
 * Stream a response from the LLM, with the ability to make tool calls
 * @param context{Array[Object]} - The context of the conversation in the openAI format
 * @param model{string} - The model to use
 * @param url{string} - The URL to use for the request
 * @param key{string} - The key to use
 * @param tools{Array[Object]} - The tools to use, in the openAI format
 * @param additionalParameters{Object} - Additional parameters to pass to the request, in the openAI format { max_tokens: number}
 * @returns {AsyncGenerator<any, void, *>} - An async generator that yields the response chunks
 */
async function* agentStream(context, model, url, key, tools, additionalParameters = {}) {
    if (containsImageContent(context)) {
        if (!(await isImageCapable(model, url, key))) {
            context = purgeImageContent(context)
        }
    }
    const hasTools = tools && tools.length > 0;
    console.log("being passed to model")
    console.log(JSON.stringify(context[context.length - 1], null, 2))

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model,
            messages: context,
            stream: true,
            ...(hasTools && { tools, tool_choice: "auto" }),
            ...additionalParameters
        })
    });

    if (!response.ok) {
        try {
            const jsonError = await response.json();
            if (jsonError.error.type === 'exceed_context_size_error') {
                console.log("hit the route where contextSize is too large")
                throw new ContextSizeError("context size exceeded")
            }
        } catch (e) {
            if (e instanceof ContextSizeError) {
                throw e
            }
        }
        throw new Error(`LLM error ${response.status}: ${await response.text()}`);
    }

    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
        const lines = decoder.decode(chunk).split('\n');
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') return;
            try {
                yield JSON.parse(data);
            } catch {
                continue;
            }
        }
    }
}

/**
 * gets the list of all models available through openrouter
 * @returns {Promise<*[]>} - a promise that resolves to an array of models
 */
async function getOpenrouterModels() {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/models", {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${process.env.OPEN_ROUTER}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = (await response.json()).data;

        const returnData = [];
        for (const model of data) {
            returnData.push({
                id: model.id,
                name: model.name,
                description: model.description,
                isFree: (model.pricing.prompt === '0' && model.pricing.completion === '0')
            });
        }
        return returnData;
    } catch (error) {
        console.error("Error fetching models:", error);
        return [];
    }
}

/**
 * gets the title for the conversation provided
 * @param context{Array[Object]} - The context of the conversation in the openAI format
 * @param model{string} - The model to use
 * @param route{string} - the route to use
 * @param key{string} - the key to use
 * @returns {Promise<string>} - a promise that resolves to the title of the conversation
 */
async function getTitle(context, model, route, key) {
    if (containsImageContent(context)) {
        if (!(await isImageCapable(model, route, key))) {
            context = purgeImageContent(context)
        }
    }
    const systemPrompt = "Create a title for the conversation so far, it should just be a few words long, respond in plain text."
    context.push({ role: "user", content: systemPrompt });
    const response = await getResponse(context, model, route, key, false);
    console.log("response: " + response)
    return response.trim();
}

/**
 * checks if the model is capable of handling image content, pings the model with a 1 pixle image with max_tokens limited to 1, if a sucessful response is gotten, then the model is capable of handling images
 * @param model{string} - the model to check
 * @param route{string} - the route to use
 * @param key{string} - the key to use
 * @returns {Promise<boolean>} - a promise that resolves to true if the model is capable of handling image content, false otherwise
 */
async function isImageCapable(model, route, key) {
    if (imageCapability.has(model + " " + route)) {
        return imageCapability.get(model + " " + route);
    }
    const context = [
        {
            role: "user",
            content: [
                {
                    type: "image_url",
                    image_url: {
                        url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
                    }
                },
                {
                    type: "text",
                    text: "1"
                }
            ]
        }
    ]
    const header = {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
    }
    const body = {
        messages: context,
        model: model,
        max_tokens: 1,
    }
    const response = await fetch(route, {
        method: "POST",
        headers: header,
        body: JSON.stringify(body)
    })
    if (response.ok) {
        imageCapability.set(model + " " + route, true);
        return true;
    }
    imageCapability.set(model + " " + route, false);
    return false;
}

/**
 * checks if the context contains image content
 * @param context{Array[Object]} - The context of the conversation in the openAI format
 * @returns {boolean} - true if the context contains image content, false otherwise
 */
function containsImageContent(context) {
    for (const message of context) {
        if (Array.isArray(message.content)) {
            for (const block of message.content) {
                if (block.type === "image_url") {
                    return true;
                }
            }
        }
    }
    return false;
}

/**
 * removes all image content from the context
 * @param context{Array[Object]} - the context of the conversation in the openAI format
 * @returns {Array[Object]} - the context in the openAI format without image content
 */
function purgeImageContent(context) {
    const newMessages = []
    for (const message of context) {
        if (Array.isArray(message.content)) {
            let textContent = ""
            for (const block of message.content) {
                if (block.type === "text") {
                    textContent += block.text
                }
            }
            if (textContent.trim() === "") {
                continue
            }
            newMessages.push({
                role: message.role,
                content: textContent
            })
        } else {
            newMessages.push(message)
        }
    }
    return newMessages
}



module.exports = { chat: getResponse, getOpenrouterModels, getTitle, agentStream, ContextSizeError };