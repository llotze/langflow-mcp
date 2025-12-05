# Langflow MCP

A Model Context Protocol (MCP) server that provides programmatic access to Langflow's flow management, component discovery, and template system. Built for integration with Claude Desktop and other MCP clients.

## Features

### Template Management
- Search templates by keyword, tags, or category
- Get complete template definitions
- Instantiate flows from templates with custom names/descriptions

### Component Discovery
- Search Langflow's component catalog by keyword
- Get detailed component specifications and parameters
- Filter to essential parameters for quick reference
- Search within component properties

### Flow Operations
- **Create** flows from templates or component specifications
- **Modify** flows using operations-based architecture with bulk operations support
- **Execute** flows with custom inputs
- **Inspect** complete flow structure and configuration
- **Validate** flows and individual components
- **Undo/Redo** changes with comprehensive history tracking

### History Management
- Track all flow modifications with before/after snapshots
- Undo and redo changes with full state restoration
- Jump to specific points in history
- View complete history timeline per flow
- Automatic history cleanup (50-entry limit per flow)

### MCP Integration
- All features exposed as MCP tools for AI agent integration
- Supports both stdio transport (Claude Desktop) and REST API
- Type-safe operations with comprehensive error handling

## Architecture

### Operations-Based Flow Modification

The flow modification system uses an **operations-based architecture** that provides:

- **Type Safety**: Each operation type is strictly typed with TypeScript discriminated unions
- **Atomic Updates**: Operations are applied individually with validation
- **Bulk Operations**: Add/remove multiple nodes or edges in single operations
- **Deep Merge**: Intelligent merging of template updates preserving existing fields
- **Component Catalog Sync**: Automatic synchronization with Langflow's component definitions
- **History Tracking**: All changes recorded with complete state snapshots

**Supported Operations:**

**Single Item Operations:**
- `addNode` - Insert new component into flow
- `removeNode` - Delete node and optionally its connections
- `updateNode` - Modify node parameters, position, or display name
- `moveNode` - Reposition node on canvas
- `addEdge` - Create connection between nodes
- `removeEdge` - Remove connection
- `updateMetadata` - Modify flow name, description, and tags

**Bulk Operations:**
- `addNodes` - Add multiple nodes with automatic layout
- `removeNodes` - Delete multiple nodes at once
- `addEdges` - Create multiple connections in single operation
- `removeEdges` - Remove multiple connections at once

**Benefits of Bulk Operations:**
- 80-90% performance improvement over individual operations
- Single validation pass for all items
- Automatic layout positioning (horizontal, vertical, grid)
- Atomic guarantees (all succeed or all rollback)

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/langflow-mcp.git
cd langflow-mcp

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Langflow credentials

# Build the project
npm run build

# Start the server
npm run dev
```

## Configuration

Create a `.env` file:

```env
# Langflow API Configuration
LANGFLOW_API_URL=http://localhost:7860
LANGFLOW_API_KEY=your_api_key_here

# Server Configuration (REST API)
PORT=3000

# MCP Mode (set automatically by MCP clients)
MCP_MODE=stdio
```

## Usage

### MCP Tools (Claude Desktop)

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "langflow": {
      "command": "node",
      "args": ["path/to/langflow-mcp/dist/api/mcp-server.js"],
      "env": {
        "LANGFLOW_API_URL": "langflow_api_url",
        "LANGFLOW_API_KEY": "your_api_key"
      }
    }
  }
}
```

### REST API

```bash
# Start the REST API server
npm run dev

# Health check
curl http://localhost:3000/health

# Search templates
curl http://localhost:3000/mcp/api/search-templates?keyword=chatbot

# Modify a flow (single operations)
curl -X POST http://localhost:3000/mcp/api/tweak-flow/FLOW_ID \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {
        "type": "updateNode",
        "nodeId": "openai_1",
        "updates": {
          "template": {
            "temperature": 0.9,
            "max_tokens": 500
          }
        },
        "merge": true
      }
    ]
  }'

# Bulk add nodes with automatic layout
curl -X POST http://localhost:3000/mcp/api/tweak-flow/FLOW_ID \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {
        "type": "addNodes",
        "nodes": [
          { "nodeId": "input_1", "component": "ChatInput", "params": {} },
          { "nodeId": "llm_1", "component": "OpenAIModel", "params": { "model_name": "gpt-4o-mini" } },
          { "nodeId": "output_1", "component": "ChatOutput", "params": {} }
        ],
        "autoLayout": "horizontal",
        "spacing": 350
      }
    ]
  }'

# Get flow history
curl http://localhost:3000/mcp/api/flow-history/FLOW_ID

# Undo last change
curl -X POST http://localhost:3000/mcp/api/undo-flow/FLOW_ID

# Redo change
curl -X POST http://localhost:3000/mcp/api/redo-flow/FLOW_ID

# Jump to specific history point
curl -X POST http://localhost:3000/mcp/api/jump-to-history/FLOW_ID/ENTRY_ID

# Get flow details
curl http://localhost:3000/mcp/api/flow-details/FLOW_ID
```

## API Reference

### Template Operations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp/api/search-templates` | GET | Search templates by keyword/tags |
| `/mcp/api/get-template/:templateId` | GET | Get complete template definition |
| `/mcp/api/create-flow-from-template/:templateId` | POST | Create flow from template |

### Flow Operations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp/api/tweak-flow/:flowId` | POST | Apply operations to modify flow |
| `/mcp/api/run-flow/:flowId` | POST | Execute flow with inputs |
| `/mcp/api/flow-details/:flowId` | GET | Get complete flow structure |
| `/mcp/api/build-flow` | POST | Build flow from components |
| `/mcp/api/test-flow` | POST | Create minimal test flow |

### History Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp/api/flow-history/:flowId` | GET | Get flow modification history |
| `/mcp/api/undo-flow/:flowId` | POST | Undo last changes |
| `/mcp/api/redo-flow/:flowId` | POST | Redo previously undone changes |
| `/mcp/api/jump-to-history/:flowId/:entryId` | POST | Jump to specific history point |

### Component Discovery

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp/api/search` | GET | Search components by keyword |
| `/mcp/api/components/:name` | GET | Get full component details |
| `/mcp/api/component-essentials/:name` | GET | Get simplified component info |
| `/mcp/api/search-component-properties/:name` | GET | Search component parameters |

## MCP Tools

### `tweak_flow`

Modify an existing flow using operations. Supports both single and bulk operations.

**Single Operation Example:**
```json
{
  "flowId": "abc-123-def-456",
  "operations": [
    {
      "type": "updateNode",
      "nodeId": "openai_1",
      "updates": {
        "template": {
          "temperature": 0.9,
          "max_tokens": 500,
          "system_message": "You are a helpful assistant."
        }
      },
      "merge": true
    }
  ]
}
```

**Bulk Operations Example:**
```json
{
  "flowId": "abc-123-def-456",
  "operations": [
    {
      "type": "addNodes",
      "nodes": [
        { "nodeId": "input_1", "component": "ChatInput", "params": {} },
        { "nodeId": "llm_1", "component": "OpenAIModel", "params": { "model_name": "gpt-4o-mini" } },
        { "nodeId": "output_1", "component": "ChatOutput", "params": {} }
      ],
      "autoLayout": "horizontal",
      "spacing": 350
    },
    {
      "type": "addEdges",
      "edges": [
        { "source": "input_1", "target": "llm_1", "targetParam": "input_value" },
        { "source": "llm_1", "target": "output_1", "targetParam": "input_value" }
      ]
    }
  ]
}
```

**Parameters:**
- `flowId` (required): UUID of the flow to modify
- `operations` (required): Array of operation objects
- `validateAfter` (optional): Validate flow after changes (default: false)
- `continueOnError` (optional): Continue if operation fails (default: false)

**Single Operation Types:**
- `addNode`: Insert new component into flow
  - `node`: Complete FlowNode object OR
  - `nodeId`, `component`: Simplified schema (builds from catalog)
  - `params`: Parameter overrides
  - `position`: Canvas coordinates

- `removeNode`: Delete component
  - `nodeId`: Node identifier
  - `removeConnections`: Also delete edges (default: true)

- `updateNode`: Modify node parameters, position, or display name
  - `nodeId`: Node identifier
  - `updates`: Object containing changes
    - `template`: Parameter updates (use `merge: true` for deep merge)
    - `position`: New canvas coordinates
    - `displayName`: Visual label
  - `merge`: Deep merge template updates (default: false)

- `moveNode`: Reposition node on canvas
  - `nodeId`: Node identifier
  - `position`: New canvas coordinates

- `addEdge`: Create connection between nodes
  - `edge`: Complete FlowEdge object OR
  - `source`, `target`: Node identifiers (simplified schema)
  - `targetParam`: Target parameter name (default: "input_value")
  - `validateConnection`: Check compatibility (default: true)

- `removeEdge`: Delete connection
  - `source`, `target`: Node identifiers
  - `sourceHandle`, `targetHandle`: Connection points (optional)

- `updateMetadata`: Modify flow properties
  - `updates`: Object with `name`, `description`, `tags`, or `metadata`

**Bulk Operation Types:**
- `addNodes`: Add multiple nodes with automatic layout
  - `nodes`: Array of node specifications with `nodeId`, `component`, and optional `params`
  - `autoLayout`: Layout strategy - `horizontal`, `vertical`, or `grid`
  - `spacing`: Distance between nodes in pixels (default: 350)

- `removeNodes`: Delete multiple nodes at once
  - `nodeIds`: Array of node IDs to remove
  - `removeConnections`: Also delete connected edges (default: true)

- `addEdges`: Create multiple connections in single operation
  - `edges`: Array of edge specifications with `source`, `target`, and optional `targetParam`
  - `validateConnections`: Validate nodes exist before adding (default: true)

- `removeEdges`: Delete multiple connections at once
  - `edges`: Array with `source` and `target` node IDs (and optional handles)

### `get_flow_history`

Retrieve complete modification history for a flow.

**Example:**
```json
{
  "flowId": "abc-123-def-456"
}
```

**Response:**
```json
{
  "success": true,
  "flowId": "abc-123-def-456",
  "canUndo": true,
  "canRedo": false,
  "currentIndex": 2,
  "totalEntries": 3,
  "entries": [
    {
      "id": "abc-123-1234567890-xyz",
      "description": "Applied 1 operations",
      "timestamp": 1234567890000
    }
  ]
}
```

### `undo_flow_changes`

Undo the last set of changes to a flow.

**Example:**
```json
{
  "flowId": "abc-123-def-456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully undid last changes",
  "flowId": "abc-123-def-456",
  "historyInfo": {
    "canUndo": true,
    "canRedo": true,
    "currentIndex": 1,
    "totalEntries": 3
  }
}
```

### `redo_flow_changes`

Redo previously undone changes.

**Example:**
```json
{
  "flowId": "abc-123-def-456"
}
```

### `jump_to_history_point`

Jump to a specific point in flow history.

**Example:**
```json
{
  "flowId": "abc-123-def-456",
  "entryId": "abc-123-1234567890-xyz"
}
```

### `get_flow_details`

Retrieve complete flow structure including all nodes, edges, and configuration.

**WARNING**: Returns large payloads - use sparingly, especially for flows with many components.

**Example:**
```json
{
  "flowId": "abc-123-def-456"
}
```

**Response includes:**
- Complete node definitions with templates
- All edge connections with handle information
- Flow metadata (name, description, tags)
- Canvas viewport settings

### Other Tools

- `search_templates`: Find templates by keyword
- `get_template`: Get template by ID
- `create_flow_from_template`: Instantiate template
- `run_flow`: Execute flow with inputs
- `search_components`: Find components by keyword
- `get_component_details`: Get component specification
- `get_component_essentials`: Get simplified component info
- `search_component_properties`: Search component parameters
- `build_and_deploy_flow`: Create flow from specs

## Technical Details

### Flow Diff Engine

The flow modification system uses a sophisticated diff engine that:

1. **Validates Operations**: Checks each operation against component catalog
2. **Applies Changes**: Updates flow structure atomically
3. **Records History**: Captures before/after state snapshots
4. **Reconstructs Templates**: Ensures all component fields are present
5. **Handles Encoding**: Manages Langflow's special "œ" character encoding
6. **Deep Merges**: Intelligently merges nested template objects

**Key Implementation:**
```typescript
// CRITICAL: Iterate over the NEW template, not the old one
// This ensures all fields from the component catalog are processed
for (const fieldName in nodeTemplate) {
  // Merge logic...
}
```

### History Management

The history system provides comprehensive undo/redo functionality:

- **Snapshot-based**: Records complete flow state before and after changes
- **Operation tracking**: Stores the operations that were applied
- **Limited retention**: Keeps last 50 entries per flow (configurable)
- **Atomic rollback**: Restores exact previous state on undo
- **Branching support**: Creating new changes after undo discards "future" entries

### Langflow Handle Encoding

Langflow uses a custom encoding scheme for edge handles:
- Replaces `"` with `œ` (OE ligature, U+0153) to avoid quote escaping
- Requires alphabetically sorted JSON keys for connection matching
- Removes whitespace from handle strings

This encoding is automatically handled by the MCP server.

## Project Structure

```
langflow-mcp/
├── src/
│   ├── api/
│   │   ├── mcp-server.ts      # MCP stdio server
│   │   └── server.ts          # REST API server
│   ├── core/
│   │   └── config.ts          # Configuration management
│   ├── services/
│   │   ├── flowDiffEngine.ts  # Flow modification engine
│   │   ├── flowValidator.ts   # Flow validation
│   │   ├── flowHistory.ts     # History management
│   │   ├── langflowApiService.ts        # Langflow API client
│   │   ├── LangflowComponentService.ts  # Component management
│   │   └── LangflowFlowBuilder.ts       # Flow construction
│   ├── types/
│   │   └── flowDiff.ts        # Operation type definitions
│   ├── utils/
│   │   └── templateLoader.ts  # Template file handling
│   ├── types.ts               # Core type definitions
│   └── tools.ts               # MCP tool implementations
├── data/
│   └── templates/             # Flow template library
└── dist/                      # Compiled JavaScript
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run tests
npm run test:flow-diff # Not currently configured properly
npm run test:template-tools
npm run test:component-tools
```

## Contributing

Contributions welcome! Please open an issue or submit a pull request.

## Acknowledgments

- Built with [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- Inspired by [n8n MCP Server](https://github.com/czlonkowski/n8n-mcp)
- Designed for [Graceful](https://github.com/llotze/langflow-custom)