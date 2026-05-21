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
    }
]

module.exports = { tools, functionsById }