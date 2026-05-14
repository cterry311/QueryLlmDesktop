const openrouterURL = "https://openrouter.ai/api/v1/chat/completions"

const defaultModel = "openrouter/free"

async function getResponse(context, model, route, key) {
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
            messages: context
        })
    });

    if (!response.ok) {
        throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

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
        throw error;
    }
}

module.exports = { chat: getResponse, getOpenrouterModels };