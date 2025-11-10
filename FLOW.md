# Langflow MCP Server - API-First Architecture & Flow

## Overview

The Langflow MCP Server provides a clean, API-first interface for discovering Langflow components and building flows programmatically. It connects directly to the Langflow backend via REST API, ensuring all operations use the latest component schemas.

---

## Architecture

```
┌───────────────┐
│   Client      │
│ (Claude, etc) │
└──────┬────────┘
       │
       ▼
┌─────────────────────────────┐
│   MCP Server (mcp-server.ts)│
│   REST API (server.ts)      │
└──────┬─────────────┬────────┘
       │             │
       ▼             ▼
┌─────────────┐  ┌─────────────┐
│ Langflow API│  │ MCP Tools   │
└─────────────┘  └─────────────┘
```

- **No local registry or static files**
- **All component and flow data comes from Langflow API**

---

## Data Flow

1. **Component Discovery**
   - MCP server queries Langflow `/api/v1/all` for live component catalog
   - Results are filtered and returned to the client

2. **Component Details**
   - MCP server fetches full template for any component from Langflow API

3. **Flow Building**
   - MCP server builds nodes and edges using live templates
   - Flow is deployed to Langflow via API

---

## API Endpoints

- `GET /health` — Server status
- `GET /mcp/api/search?keyword=...` — Search components
- `GET /mcp/api/components/:componentName` — Get component details
- `POST /mcp/api/build-flow` — Build and deploy a flow
- `POST /mcp/api/test-flow` — Create a minimal test flow

---

## MCP Protocol Tools

- `search_langflow_components`
- `get_component_details`
- `build_and_deploy_flow`

---

## Configuration

- Only requires Langflow API URL and API key
- No static files, templates, or local database needed

---

## Extending

- Add new MCP tools by extending `tools.ts`
- Add new endpoints in `server.ts`
- All new features should use Langflow's API as the source of truth

---

**This architecture ensures your MCP server is always up-to-date, maintainable, and ready for future Langflow updates.**