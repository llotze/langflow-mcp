# Getting Started with Langflow MCP Server (API-First)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file in the project root with:

```
PORT=3000
LANGFLOW_API_URL=http://localhost:7860
LANGFLOW_API_KEY=your-langflow-api-key
```

### 3. Build and Run the Server

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

### 4. Test the Server

Health check:
```bash
curl http://localhost:3000/health
```

Search for components:
```bash
curl "http://localhost:3000/mcp/api/search?keyword=OpenAI"
```

Get component details:
```bash
curl "http://localhost:3000/mcp/api/components/OpenAIModel"
```

Create a flow:
```bash
curl -X POST http://localhost:3000/mcp/api/build-flow \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Chatbot Flow",
    "description": "A simple chatbot",
    "nodes": [
      { "component": "ChatInput", "id": "input1", "position": { "x": 100, "y": 200 }, "params": {} },
      { "component": "OpenAIModel", "id": "model1", "position": { "x": 400, "y": 200 }, "params": { "model_name": "gpt-4" } },
      { "component": "ChatOutput", "id": "output1", "position": { "x": 700, "y": 200 }, "params": {} }
    ],
    "connections": [
      { "source": "input1", "target": "model1", "targetParam": "input_value" },
      { "source": "model1", "target": "output1", "targetParam": "input_value" }
    ]
  }'
```

### 5. Claude Desktop Integration

Add the MCP server to your Claude Desktop config:

```json
"langflow": {
  "command": "node",
  "args": ["C:\\path\\to\\langflow-mcp\\dist\\api\\mcp-server.js"],
  "env": {
    "MCP_MODE": "stdio",
    "LOG_LEVEL": "error",
    "PORT": "3001",
    "LANGFLOW_API_URL": "http://localhost:7860",
    "LANGFLOW_API_KEY": "your-langflow-api-key"
  }
}
```

### 6. Troubleshooting

- Ensure Langflow is running and accessible
- Check `.env` for correct API URL and key
- Use `npm run build` before starting in production

---

**You are now ready to use Langflow MCP Server in API-first mode!**
