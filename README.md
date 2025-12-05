# Langflow MCP

Langflow MCP is a Model Context Protocol (MCP) server and API wrapper for Langflow, enabling programmatic access to Langflow's flow, component, and template management features. It provides both a REST API and MCP tool interface for building, searching, validating, and running Langflow flows.

## Features

- **Template Management**
  - Search templates by keyword, tags, or category
  - Get full template details
  - Create flows from templates

- **Component Management**
  - Search components by keyword
  - Get component details and essentials
  - Search component properties

- **Flow Management**
  - Build and deploy flows from component specs
  - Run flows with input data
  - Create minimal test flows

- **Flow Diff & Validation**
  - Validate flows and nodes
  - Apply diff operations to flows (add/update/remove nodes, connections)

- **MCP Tool Interface**
  - All major features exposed as MCP tools for agent integration

## API Endpoints

- `/mcp/api/search-templates` — Search templates
- `/mcp/api/get-template/:templateId` — Get template details
- `/mcp/api/create-flow-from-template/:templateId` — Create flow from template
- `/mcp/api/tweak-flow/:flowId` — **[UNFINISHED]** Apply diff operations to a flow
- `/mcp/api/run-flow/:flowId` — Run a flow
- `/mcp/api/search` — Search components
- `/mcp/api/components/:componentName` — Get component details
- `/mcp/api/component-essentials/:componentName` — Get component essentials
- `/mcp/api/search-component-properties/:componentName` — Search component properties
- `/mcp/api/build-flow` — Build and deploy flow
- `/mcp/api/test-flow` — Create minimal test flow

## MCP Tools

- `search_templates`
- `get_template`
- `create_flow_from_template`
- `tweak_flow` (**unfinished**)
- `run_flow`
- `search_components`
- `get_component_details`
- `get_component_essentials`
- `search_component_properties`
- `build_and_deploy_flow`

## Setup

1. Clone the repo
2. Install dependencies: `npm install`
3. Configure Langflow API credentials in `.env` or via environment variables
4. Start the server: `npm run dev`

## Notes

- The **tweak flows tool** (`tweak_flow`) is currently **unfinished** and may not support all diff operations or validation scenarios.
- For best results, use real component metadata when building flows or nodes.

## License

MIT

### tweak_flow Tool Usage

**Required fields:**  
- `flowId` (string)
- `operations` (array)

**Example:**
```json
{
  "flowId": "FLOW_ID",
  "operations": [
    {
      "type": "updateNode",
      "nodeId": "openai_1",
      "updates": { "template": { "temperature": 0.9 } },
      "merge": true
    },
    {
      "type": "updateMetadata",
      "updates": { "name": "Creative Brainstorming Bot" }
    }
  ]
}
```
Do **not** use `tweaks`, `newName`, or `newDescription` as top-level fields.