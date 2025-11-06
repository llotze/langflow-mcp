# Getting Started with Langflow MCP Server

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Data

You need to provide three things:

#### A. Components JSON
Place your full Langflow `components.json` file at:
```
./data/components.json
```

A sample file is provided. Replace it with the actual components.json from your Langflow installation or the one provided to you.

#### B. Flow Templates (Optional)
Add exported Langflow flow JSON files to:
```
./data/templates/
```

For example, add `Vector Store RAG.json` to this directory.

#### C. Component Documentation (Optional)
Add component markdown documentation files to:
```
./data/docs/
```

### 3. Run the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

### 4. Test the Server

Open a browser or use curl:
```bash
# Health check
curl http://localhost:3000/health

# List all components
curl http://localhost:3000/mcp/list_components

# Search for components
curl -X POST http://localhost:3000/mcp/search_components \
  -H "Content-Type: application/json" \
  -d '{"keyword": "openai"}'
```

## Next Steps

### Adding Real Components

1. Copy your full `components.json` from Langflow to `./data/components.json`
2. Copy flow template JSON files to `./data/templates/`
3. Copy component documentation markdown files to `./data/docs/`
4. Restart the server

### Using the API

See the main README.md for full API documentation.

### Example: Creating a Flow

```bash
curl -X POST http://localhost:3000/mcp/create_flow \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My First Flow",
    "description": "A simple AI flow",
    "nodes": [
      {
        "id": "node-1",
        "type": "OpenAI",
        "position": { "x": 100, "y": 100 },
        "data": {
          "node": {
            "template": {
              "api_key": "sk-...",
              "model": "gpt-4"
            },
            "description": "OpenAI model",
            "base_classes": ["LLM"],
            "display_name": "OpenAI"
          },
          "type": "OpenAI",
          "id": "node-1"
        }
      }
    ],
    "edges": []
  }'
```

## Troubleshooting

### Port Already in Use
Change the port in `.env`:
```
PORT=3001
```

### Components Not Loading
- Check that `components.json` exists at the path specified
- Check the format of the JSON file
- Check server logs for errors

### Database Issues
Delete the database and restart:
```bash
rm ./data/langflow.db
npm run dev
```

## Docker Deployment

Build:
```bash
docker build -t langflow-mcp .
```

Run:
```bash
docker run -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  langflow-mcp
```

## Railway Deployment

1. Connect your GitHub repo to Railway
2. Set environment variables in Railway dashboard
3. Railway will automatically build and deploy

## Support

For issues or questions, check the main README.md or review the source code comments.
