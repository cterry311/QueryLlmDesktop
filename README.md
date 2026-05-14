# Query

A desktop application for interacting with Large Language Models (LLMs), built with Electron. Query supports both simple conversational chat and fully autonomous agentic workflows, with a focus on flexibility, privacy, and extensibility.

---

## Features

- **Multi-model support** — Connect to any OpenAI-compatible API, including OpenRouter, local models (e.g. Ollama), or your own hosted endpoints. Bring your own API keys.
- **Agentic capabilities** — Models can operate autonomously, executing multi-step tasks using built-in tools including web search, HTTP requests, and sandboxed code execution.
- **Persistent memory** — Models have access to a vector database for long-term memory, allowing them to recall information across conversations.
- **Local file access** — With explicit user permission, agents can read and write to local files on your machine.
- **Conversation history** — All conversations are stored in a local SQL database, keeping your data on your machine.
- **Customizable model parameters** — Adjust temperature, top-p, max tokens, and other parameters per conversation or model.

---

## Project Structure

```
Query/
│
├── frontend/                        # Electron app — UI only, minimal business logic
│   ├── main.js                      # Electron entry point, window management
│   ├── preload.js                   # Secure IPC bridge between renderer and main
│   └── src/
│       ├── components/              # UI components (chat window, message bubbles, etc.)
│       └── pages/                   # Application views/screens
│
├── backend/                         # Core business logic and orchestration
│   ├── main.js                      # Entry point, orchestrates backend services
│   ├── llmClient.js                 # OpenAI-compatible API client (OpenRouter + custom)
│   ├── agentOrchestrator.js         # Agentic loop — think, act, observe
│   ├── toolHandlers.js              # Safe tool implementations (web search, HTTP, etc.)
│   └── dal/                         # Data Access Layer
│       ├── conversationDAL.js       # Conversation history (SQL)
│       └── memoryDAL.js             # Vector memory queries
│
├── agent-sandbox/                   # Isolated environment for agent code execution
│   ├── runner.js                    # Executes agent-generated code and terminal commands
│   └── Dockerfile                   # Locked down container, no network access
│
└── docker-compose.yml               # Wires all backend services together
```

---

## Architecture

Query is split into isolated services, each with a clear responsibility:

| Service | Description |
|---|---|
| **Frontend** | Electron desktop app. Communicates with the backend over a local WebSocket/HTTP connection. Runs natively on the host machine. |
| **Backend** | Node.js service handling LLM API calls, agent orchestration, tool routing, and database access. |
| **Agent Sandbox** | Isolated Docker container with no network access. Used exclusively for executing agent-generated code and terminal commands safely. |
| **SQL Database** | SQLite or PostgreSQL. Stores full conversation history locally. |
| **Vector Database** | Chroma or pgvector (PostgreSQL extension). Stores embedded conversation memory for semantic recall. |

> The frontend runs natively and is not containerized, as Electron requires direct access to the host OS display. All other services run inside Docker containers managed by Docker Compose.

---

## Agent Tools

When operating in agent mode, models have access to the following tools:

- **Web search** — Search the web and retrieve results
- **HTTP requests** — Make arbitrary web requests
- **Code execution** — Execute code inside the isolated sandbox container
- **Memory recall** — Query the vector database for relevant past context
- **File read/write** — Read and write local files (requires explicit user permission)

---

## Model Compatibility

Query works with any API that follows the OpenAI chat completions format, including:

- [OpenRouter](https://openrouter.ai) — Access to a wide range of hosted models
- [Ollama](https://ollama.com) — Run models locally on your machine
- Any other OpenAI-compatible endpoint

API endpoints and keys are configurable per provider in the application settings.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop UI | Electron, HTML, CSS, JavaScript |
| Backend | Node.js |
| Database | SQLite / PostgreSQL |
| Vector Memory | Chroma / pgvector |
| Containerization | Docker, Docker Compose |
| LLM APIs | OpenRouter, OpenAI-compatible endpoints |

---

## Getting Started

> Prerequisites: [Node.js](https://nodejs.org) and [Docker Desktop](https://www.docker.com/products/docker-desktop)

```bash
# Clone the repository
git clone https://github.com/your-username/query.git
cd query

# Start backend services
docker compose up -d

# Install and run the frontend
cd frontend
npm install
npm start
```

---

## Configuration

Add your API keys and configuration to a `.env` file in the root directory:

```env
OPENROUTER_API_KEY=your_key_here
```

Additional providers, model parameters, and settings can be configured directly within the application UI.
