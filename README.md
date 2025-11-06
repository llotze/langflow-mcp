# Langflow MCP Server

MCP (Model Context Protocol) server for Langflow component discovery and flow building, modeled after n8n-mcp.

## Features

- **Component Discovery**: List and search Langflow components
- **Component Documentation**: Access detailed component documentation
- **Flow Building**: Create and modify Langflow flows programmatically
- **Flow Templates**: Access pre-built flow templates
- **Validation**: Validate component configurations before building flows
- **Diff Operations**: Efficiently update flows using diff operations

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file or set environment variables:

```env
PORT=3000
COMPONENTS_JSON_PATH=./data/components.json
FLOW_TEMPLATES_PATH=./data/templates
DOCS_PATH=./data/docs
DATABASE_PATH=./data/langflow.db
```

## Setup

1. Place your `components.json` file in `./data/components.json`
2. Add flow templates (JSON files) to `./data/templates/`
3. Add component documentation (markdown files) to `./data/docs/`

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## API Endpoints

### Health Check
```
GET /health
```

### Component Discovery

#### List All Components
```
GET /mcp/list_components
```

Returns all registered Langflow components.

#### Search Components
```
POST /mcp/search_components
Content-Type: application/json

{
  "keyword": "openai",
  "category": "models",
  "tool_mode": true
}
```

Search components by keyword, category, and other filters.

#### Get Component Essentials
```
GET /mcp/component/:name/essentials
```

Returns essential properties (required/common parameters) for a component.

#### Get Component Documentation
```
GET /mcp/component/:name/documentation
```

Returns full documentation for a component.

#### Validate Component Config
```
POST /mcp/validate_component_config
Content-Type: application/json

{
  "name": "OpenAI",
  "config": {
    "api_key": "sk-...",
    "model": "gpt-4"
  }
}
```

Validates a component configuration.

### Flow Building

#### Create Flow
```
POST /mcp/create_flow
Content-Type: application/json

{
  "name": "My AI Flow",
  "description": "A flow for AI processing",
  "nodes": [...],
  "edges": [...]
}
```

Creates a new Langflow flow.

#### Update Flow (Partial)
```
POST /mcp/update_flow_partial
Content-Type: application/json

{
  "flow": { ... },
  "operations": [
    {
      "operation": "addNode",
      "node": { ... }
    },
    {
      "operation": "addConnection",
      "edge": { ... }
    }
  ]
}
```

Updates a flow using diff operations.

**Supported operations:**
- `addNode` - Add a new node
- `removeNode` - Remove a node
- `updateNode` - Update node properties
- `addConnection` - Add an edge
- `removeConnection` - Remove an edge
- `updateFlowMetadata` - Update flow metadata

### Flow Templates

#### List Templates
```
GET /mcp/list_flow_templates
```

Returns all available flow templates.

#### Get Template
```
GET /mcp/flow_template/:name
```

Returns a specific flow template.

### Categories

#### Get All Categories
```
GET /mcp/categories
```

Returns all component categories.

## Example Usage

### Search for OpenAI components

```bash
curl -X POST http://localhost:3000/mcp/search_components \
  -H "Content-Type: application/json" \
  -d '{"keyword": "openai"}'
```

### Create a simple flow

```bash
curl -X POST http://localhost:3000/mcp/create_flow \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI Chat Flow",
    "description": "Simple chat flow",
    "nodes": [],
    "edges": []
  }'
```

### Get component essentials

```bash
curl http://localhost:3000/mcp/component/OpenAI/essentials
```

## Architecture

- **`server.ts`** - Main Express server
- **`config.ts`** - Configuration management
- **`types.ts`** - TypeScript type definitions
- **`componentExtractor.ts`** - Extracts components from JSON and docs
- **`registry.ts`** - SQLite-based component registry
- **`tools.ts`** - MCP tool implementations

## Docker

Build and run with Docker:

```bash
docker build -t langflow-mcp .
docker run -p 3000:3000 langflow-mcp
```

## License

ISC
