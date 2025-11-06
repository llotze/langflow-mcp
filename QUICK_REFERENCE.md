# Langflow MCP Server - Quick Reference

## 🚀 Start/Stop Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm run build
npm start

# Stop server
Ctrl + C
```

## 🔧 Configuration Files

- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript config
- `.env` - Environment variables (create from `.env.example`)
- `data/components.json` - Component definitions
- `data/templates/` - Flow templates
- `data/docs/` - Component documentation

## 📡 API Endpoints

### Component Discovery

```bash
# List all components
GET http://localhost:3000/mcp/list_components

# Search components
POST http://localhost:3000/mcp/search_components
Body: {"keyword": "search term", "category": "models"}

# Get component essentials
GET http://localhost:3000/mcp/component/OpenAI/essentials

# Get component documentation
GET http://localhost:3000/mcp/component/OpenAI/documentation

# Get all categories
GET http://localhost:3000/mcp/categories
```

### Flow Building

```bash
# Create flow
POST http://localhost:3000/mcp/create_flow
Body: {"name": "My Flow", "nodes": [], "edges": []}

# Update flow (diff operations)
POST http://localhost:3000/mcp/update_flow_partial
Body: {"flow": {...}, "operations": [{...}]}

# Validate component config
POST http://localhost:3000/mcp/validate_component_config
Body: {"name": "OpenAI", "config": {...}}
```

### Templates

```bash
# List templates
GET http://localhost:3000/mcp/list_flow_templates

# Get specific template
GET http://localhost:3000/mcp/flow_template/Vector%20Store%20RAG
```

## 🔄 Diff Operations

Available operations for `update_flow_partial`:

```json
{
  "flow": { ...existing flow... },
  "operations": [
    {"operation": "addNode", "node": {...}},
    {"operation": "removeNode", "nodeId": "node-1"},
    {"operation": "updateNode", "nodeId": "node-1", "updates": {...}},
    {"operation": "addConnection", "edge": {...}},
    {"operation": "removeConnection", "edge": {...}},
    {"operation": "updateFlowMetadata", "metadata": {...}}
  ]
}
```

## 🧪 Testing with curl

```bash
# Health check
curl http://localhost:3000/health

# List components
curl http://localhost:3000/mcp/list_components

# Search
curl -X POST http://localhost:3000/mcp/search_components \
  -H "Content-Type: application/json" \
  -d '{"keyword":"openai"}'

# Create flow
curl -X POST http://localhost:3000/mcp/create_flow \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Flow","nodes":[],"edges":[]}'
```

## 📂 File Structure

```
langflow-mcp/
├── src/                    # TypeScript source
│   ├── server.ts          # Main server
│   ├── tools.ts           # MCP tools
│   ├── registry.ts        # Database
│   ├── componentExtractor.ts
│   ├── config.ts
│   └── types.ts
├── data/                   # Data directory
│   ├── components.json    # Components
│   ├── templates/         # Flow templates
│   ├── docs/              # Documentation
│   └── langflow.db        # SQLite DB
├── dist/                   # Compiled JS
└── node_modules/           # Dependencies
```

## 🐛 Troubleshooting

```bash
# Check if server is running
curl http://localhost:3000/health

# View logs
# (in terminal where server is running)

# Rebuild database
rm data/langflow.db
npm run dev

# Check TypeScript errors
npm run build

# View database
sqlite3 data/langflow.db
sqlite> SELECT * FROM components;
```

## 🌐 Environment Variables

```bash
PORT=3000
COMPONENTS_JSON_PATH=./data/components.json
FLOW_TEMPLATES_PATH=./data/templates
DOCS_PATH=./data/docs
DATABASE_PATH=./data/langflow.db
```

## 🐳 Docker

```bash
# Build
docker build -t langflow-mcp .

# Run
docker run -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  langflow-mcp

# Run with env vars
docker run -p 3000:3000 \
  -e PORT=3000 \
  -v $(pwd)/data:/app/data \
  langflow-mcp
```

## 🚢 Railway Deployment

1. Push code to GitHub
2. Connect repo to Railway
3. Railway auto-detects Node.js
4. Set environment variables in Railway dashboard
5. Deploy automatically

## 📊 Database Schema

```sql
CREATE TABLE components (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE,
  display_name TEXT,
  description TEXT,
  category TEXT,
  subcategory TEXT,
  parameters_schema TEXT,
  input_types TEXT,
  output_types TEXT,
  tool_mode BOOLEAN,
  legacy BOOLEAN,
  beta BOOLEAN,
  documentation_link TEXT,
  documentation_content TEXT,
  icon TEXT,
  created_at DATETIME,
  updated_at DATETIME
);
```

## 🔑 Key Files to Customize

1. **data/components.json** - Add your Langflow components
2. **data/templates/** - Add flow templates
3. **data/docs/** - Add documentation
4. **src/tools.ts** - Add custom MCP tools
5. **.env** - Set configuration

## ✅ Health Check Response

```json
{
  "status": "ok",
  "message": "Langflow MCP Server is running"
}
```

## 📝 Component JSON Structure

```json
{
  "category_name": [
    {
      "name": "ComponentName",
      "display_name": "Display Name",
      "description": "Description",
      "category": "category",
      "tool_mode": true,
      "parameters": [
        {
          "name": "param_name",
          "display_name": "Param Name",
          "type": "string",
          "required": true,
          "description": "Param description"
        }
      ],
      "input_types": ["string"],
      "output_types": ["string"]
    }
  ]
}
```

## 🎯 Common Tasks

### Add New Component
1. Edit `data/components.json`
2. Restart server
3. Verify: `curl http://localhost:3000/mcp/list_components`

### Add Flow Template
1. Copy JSON file to `data/templates/`
2. No restart needed
3. Verify: `curl http://localhost:3000/mcp/list_flow_templates`

### Add Documentation
1. Copy .md/.mdx to `data/docs/`
2. Restart server
3. Verify: `curl http://localhost:3000/mcp/component/NAME/documentation`

---

**Server Running**: http://localhost:3000
**Status**: ✅ Ready
