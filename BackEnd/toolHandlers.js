/*
{
  "model": "your-model",
  "messages": [
    { "role": "user", "content": "What's the weather in New York?" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get the current weather for a city",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {
              "type": "string",
              "description": "The city to get weather for"
            }
          },
          "required": ["city"]
        }
      }
    }
  ],
  "tool_choice": "auto"
}
 */

const functionsById = {
    "execute_code_sandbox": async (args) => {
        const { code, language } = args;
        try {
            const response = await fetch("http://localhost:3002/execute", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    code,
                    language
                })
            })
            return response.json();
        } catch (error) {
            console.error("Error executing code:", error);
            return { error: "Failed to execute code, it is probably your fault" };
        }
    },
    "web_search": async (args) => {
        let { query, freshness, summary, count } = args;
        try {
            if (typeof query !== 'string') {
                return { error: 'query must be a string' };
            }
            if (freshness && typeof freshness !== 'string') {
                return { error: 'freshness must be a string' };
            }
            if (!summary) {
                summary = false;
            }
            if (typeof summary !== 'boolean') {
                return { error: 'summary must be a boolean' };
            }
            if (!count) {
                count = 3
            }
            if (typeof count !== 'number') {
                return { error: 'count must be a number' };
            }
            const response = await fetch("https://api.langsearch.com/v1/web-search", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.LANG_SEARCH}`
                },
                body: JSON.stringify({
                    query,
                    freshness,
                    summary,
                    count
                })
            })
            return response.json();
        } catch (error) {
            console.error("Error executing code:", error);
            return { error: "Error when Fetching Result, possible malformed request" };
        }
    },
    "fetch_request": async (args) => {
        const { url, method, headers, body } = args;
        try {
            if (typeof url !== 'string') {
                return { error: 'url must be a string' };
            }
            const response = await fetch(url, {
                method,
                headers,
                body: JSON.stringify(body)
            })
            return response.text();
        } catch (error) {
            console.error("Error executing code:", error);
            return { error: "Fetch request failed, probably malformed request" };
        }
    },
    "scratchpad": async (args) => {
        return "ok";
    }
}


const tools = [
    {
        "type":"function",
        "function": {
            "name": "execute_code_sandbox",
            "description": "execute python or javascript code in an isolated environment, get the console output of the code",
            "parameters": {
                "type": "object",
                "required": ["code", "language"],
                "properties": {
                    "code": {
                        "type": "string",
                        "description": "the code to be executed",
                    },
                    "language": {
                        "type": "string",
                        "description": "the language of the code to be executed, either 'python', or 'javascript'",
                    }
                }
            }
        }
    },
    {
        "type":"function",
        "function": {
            "name": "web_search",
            "description": "search the internet for information, return the results",
            "parameters": {
                "type": "object",
                "required": ["query"],
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "the query to search for",
                    },
                    "freshness": {
                        "type": "string",
                        "description": "Specifies the time range for search results. Possible values:\n" +
                            "- oneDay: Results from the past 24 hours.\n" +
                            "- oneWeek: Results from the past week.\n" +
                            "- oneMonth: Results from the past month.\n" +
                            "- oneYear: Results from the past year.\n" +
                            "- noLimit: No time filter (default).",
                    },
                    "summary": {
                        "type": "boolean",
                        "description": "whether to show a summary of each result in addition to a snippet and link. Warning, the summary can be quite long",
                    },
                    "count": {
                        "type": "number",
                        "description": "the number of results to return possible range is 1-10",
                    }
                }
            }
        }
    },
    {
        "type":"function",
        "function": {
            "name": "fetch_request",
            "description": "make a fetch request to a url, return the response",
            "parameters": {
                "type": "object",
                "required": ["url"],
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "the url to fetch from",
                    },
                    "method": {
                        "type": "string",
                        "description": "the method to use for the fetch request, possible values are 'GET', 'POST', 'PUT', 'DELETE'",
                    },
                    "headers": {
                        "type": "object",
                        "description": "the headers to send with the fetch request",
                    },
                    "body": {
                        "type": "object",
                        "description": "the body of the fetch request",
                    }
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
                    "thoughts": {
                        "type": "string",
                        "description": "your internal thoughts, reasoning, or plan"
                    }
                },
                "required": ["thoughts"]
            }
        }
    }
]

module.exports = { tools, functionsById }