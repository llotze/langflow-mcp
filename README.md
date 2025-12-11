# Langflow MCP Server

**AI-powered assistant server for Langflow visual flow builder.** Implements the Model Context Protocol (MCP) to enable conversational flow building through Claude and provides HTTP/REST APIs for programmatic flow management.

 **Live Production Instance**: `https://langflow-mcp-production.up.railway.app`

---

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Installation](#-installation)
- [Configuration](#%EF%B8%8F-configuration)
- [Usage](#-usage)
  - [HTTP Server Mode](#http-server-mode)
  - [MCP Server Mode](#mcp-server-mode)
- [API Reference](#-api-reference)
- [Deployment](#-deployment)
- [Development](#-development)
- [Project Structure](#-project-structure)

---

##  Features

### **Core Capabilities**

-  **Hopper AI Assistant** - Claude-powered conversational interface for natural language flow building
-  **Per-User Authentication** - Each user provides their own Langflow API key (no shared credentials)
-  **Real-Time Updates** - Server-Sent Events (SSE) for live flow synchronization
-  **Bulk Operations** - Efficient multi-node/edge operations (80-90% faster than individual operations)
- ↩ **Undo/Redo System** - Complete flow history tracking with jump-to-point capability
-  **Template System** - Pre-built flow templates for common use cases

### **Flow Management**

-  **Differential Updates** - Apply targeted changes without replacing entire flows
-  **Component Discovery** - Search and explore 100+ Langflow components
-  **Smart Connections** - Automatic handle generation with type validation
-  **Auto-Layout** - Horizontal, vertical, and grid layouts for bulk node additions
-  **Flow Notes** - Add markdown documentation directly to flows

### **Developer Experience**

-  **Comprehensive JSDoc** - Detailed inline documentation for all APIs
-  **Type Safety** - Full TypeScript type definitions
-  **Pre-Validation** - Atomic operation application with rollback on failure
-  **Flexible Schemas** - Support for both simplified and full node/edge definitions

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│     Langflow Frontend (graceful-ai.com)                │
│     ┌──────────────┐         ┌──────────────────┐     │
│     │  Flow Canvas │         │  Hopper Chat     │     │
│     │  (React)     │         │  (Claude UI)     │     │
│     └──────┬───────┘         └────────┬─────────┘     │
│            │                           │               │
│            │ x-api-key: user's key    │               │
│            ▼                           ▼               │
└────────────┼───────────────────────────┼───────────────┘
             │                           │
             │     HTTPS / REST          │
             ▼                           ▼
┌─────────────────────────────────────────────────────────┐
│  MCP Server (Railway)                                   │
│  https://langflow-mcp-production.up.railway.app         │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  HTTP Server (Express)                         │    │
│  │  - REST API endpoints                          │    │
│  │  - SSE for real-time updates                   │    │
│  │  - Per-user authentication                     │    │
│  └────────────────┬───────────────────────────────┘    │
│                   │                                     │
│  ┌────────────────▼───────────────────────────────┐    │
│  │  Core Services                                 │    │
│  │  - FlowDiffEngine (operation processor)       │    │
│  │  - FlowValidator (structure validation)       │    │
│  │  - FlowHistory (undo/redo tracking)          │    │
│  │  - LangflowApiService (API client)           │    │
│  │  - ComponentService (catalog access)          │    │
│  └────────────────┬───────────────────────────────┘    │
│                   │                                     │
│  ┌────────────────▼───────────────────────────────┐    │
│  │  Hopper Assistant (Claude Integration)        │    │
│  │  - Multi-turn conversations                   │    │
│  │  - Tool calling (tweak_flow, search, etc.)   │    │
│  │  - Context-aware suggestions                  │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────┬───────────────────────────────────┘
                      │
                      │ x-api-key: user's key
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Langflow API (graceful-ai.com/api/v1)                 │
│  - Flow CRUD operations                                 │
│  - Component catalog                                    │
│  - Flow execution                                       │
│  - Chat history storage                                 │
└─────────────────────────────────────────────────────────┘
```

### **Component Overview**

| Component | Purpose | Technology |
|-----------|---------|-----------|
| **HTTP Server** | REST API for flow operations | Express.js |
| **MCP Server** | Stdio protocol for Claude Desktop | MCP SDK |
| **FlowDiffEngine** | Applies differential operations to flows | TypeScript |
| **FlowValidator** | Validates flow structure and parameters | TypeScript |
| **FlowHistory** | Manages undo/redo state | In-memory store |
| **Hopper Assistant** | AI-powered flow building | Claude Sonnet 4.5 |

---

## 🚀 Installation

### **Prerequisites**

- **Node.js** ≥ 20.0.0
- **npm** ≥ 10.0.0
- **Langflow Instance** (local or production)
- **Anthropic API Key** (for Hopper assistant)

### **Clone Repository**

```bash
git clone https://github.com/yourusername/langflow-mcp.git
cd langflow-mcp
```

### **Install Dependencies**

```bash
npm install
```

---

## ⚙️ Configuration

Create a `.env` file in the project root:

```bash
# Server Configuration
PORT=3001

# Langflow API (required)
LANGFLOW_API_URL=https://www.graceful-ai.com

# Anthropic API Key (required for Hopper assistant)
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx

# CORS Configuration
ALLOWED_ORIGINS=https://www.graceful-ai.com,https://graceful-ai.com,http://localhost:3000

# Node Environment
NODE_ENV=production
```

### **Environment Variables**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | HTTP server port |
| `LANGFLOW_API_URL` | Yes | - | Langflow instance URL |
| `ANTHROPIC_API_KEY` | Yes | - | Anthropic API key for Claude |
| `ALLOWED_ORIGINS` | No | `*` | Comma-separated CORS origins |
| `NODE_ENV` | No | `development` | Node environment |

---

## 💻 Usage

### **HTTP Server Mode**

Start the REST API server for production use:

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

Server will be available at `http://localhost:3001`.

#### **Health Check**

```bash
curl http://localhost:3001/health
```

**Response:**
```json
{
  "status": "ok",
  "message": "Langflow MCP Server is running",
  "langflowApiEnabled": true,
  "timestamp": "2025-12-10T23:50:00.000Z"
}
```

### **MCP Server Mode**

Run as an MCP server for Claude Desktop integration:

```bash
npm run dev:mcp
```

#### **Claude Desktop Configuration**

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "langflow": {
      "command": "node",
      "args": [
        "/absolute/path/to/langflow-mcp/dist/api/mcp-server.js"
      ],
      "env": {
        "LANGFLOW_API_URL": "https://www.graceful-ai.com",
        "LANGFLOW_API_KEY": "your-api-key-here",
        "ANTHROPIC_API_KEY": "sk-ant-xxxxx"
      }
    }
  }
}
```

---

## 📚 API Reference

See **[API Documentation](./docs/API.md)** for complete endpoint reference.

### **Quick Examples**

#### **Modify a Flow**

```bash
curl -X POST https://langflow-mcp-production.up.railway.app/mcp/api/tweak-flow/abc-123 \
  -H "Content-Type: application/json" \
  -H "x-api-key: lf_your_key_here" \
  -d '{
    "flowId": "abc-123",
    "operations": [
      {
        "type": "updateNode",
        "nodeId": "OpenAI-xyz",
        "updates": {
          "template": {
            "temperature": 0.9
          }
        },
        "merge": true
      }
    ]
  }'
```

#### **Search Components**

```bash
curl https://langflow-mcp-production.up.railway.app/mcp/api/search?keyword=openai \
  -H "x-api-key: lf_your_key_here"
```

#### **Chat with Hopper**

```bash
curl -X POST https://langflow-mcp-production.up.railway.app/mcp/api/assistant \
  -H "Content-Type: application/json" \
  -H "x-api-key: lf_your_key_here" \
  -d '{
    "flow_id": "abc-123",
    "session_id": "user-456",
    "message": "Add an OpenAI model to my flow"
  }'
```

---

## 🚢 Deployment

### **Railway (Recommended)**

This project is configured for one-click Railway deployment.

#### **Step 1: Create Railway Project**

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy
railway up
```

#### **Step 2: Set Environment Variables**

In Railway dashboard → **Variables**:

```
PORT=3001
LANGFLOW_API_URL=https://www.graceful-ai.com
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
ALLOWED_ORIGINS=https://www.graceful-ai.com,https://graceful-ai.com
NODE_ENV=production
```

#### **Step 3: Generate Public Domain**

**Settings** → **Networking** → **Generate Domain**

Example: `https://langflow-mcp-production.up.railway.app`

### **Docker**

```bash
# Build image
docker build -t langflow-mcp .

# Run container
docker run -p 3001:3001 \
  -e LANGFLOW_API_URL=https://www.graceful-ai.com \
  -e ANTHROPIC_API_KEY=sk-ant-xxxxx \
  langflow-mcp
```

### **Vercel**

```bash
vercel --prod
```

Set environment variables in Vercel dashboard.

---

## 🔧 Development

### **Project Scripts**

```bash
# Development server with hot reload
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start

# Run MCP server (stdio mode)
npm run dev:mcp

### **Test Scripts**

⚠️ **Note**: Test scripts are currently outdated and may fail with current API structure. They were built for an earlier version and need refactoring to work with:
- Per-user authentication (now requires `x-api-key` header)
- Updated `tweak_flow` operation format
- New bulk operation schemas

**Available (but outdated):**
```bash
npm run test:api-first          # ⚠️ Needs update for auth
npm run test:flow-diff          # ⚠️ Needs update for new schemas
npm run test:template-tools     # ⚠️ Needs update for auth
npm run test:component-tools  
```

### **Code Quality**

- **TypeScript** - Strict type checking enabled
- **JSDoc** - Comprehensive inline documentation
- **Error Handling** - Graceful error recovery with detailed messages
- **Validation** - Pre-validation with atomic operations

---

## 📁 Project Structure

```
langflow-mcp/
├── src/
│   ├── api/
│   │   ├── server.ts              # HTTP/REST server (Express)
│   │   └── mcp-server.ts          # MCP stdio server
│   ├── services/
│   │   ├── flowDiffEngine.ts     # Operation processor
│   │   ├── flowValidator.ts      # Structure validator
│   │   ├── flowHistory.ts        # Undo/redo manager
│   │   ├── langflowApiService.ts # Langflow API client
│   │   ├── LangflowComponentService.ts
│   │   └── LangflowFlowBuilder.ts
│   ├── core/
│   │   └── config.ts              # Environment config loader
│   ├── types/
│   │   └── flowDiff.ts            # Operation type definitions
│   ├── utils/
│   │   ├── templateLoader.ts      # Template management
│   │   └── componentNameMapping.ts
│   ├── types.ts                   # Core type definitions
│   └── tools.ts                   # MCP tools implementation
├── docs/
│   └── API.md                     # API reference (see below)
├── scripts/
│   ├── test-api-first.ts          # Test scripts
│   ├── test-flowdiff-validator.ts
│   ├── test-template-tools.ts
│   └── test-component-tools.ts
├── Dockerfile                     # Production Docker image
├── .dockerignore
├── .gitignore
├── .env.example                   # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

---

## 👤 Author

**Lucas Lotze, Dominic Laiosa, Daniel Wijaya**

---

## 🙏 Acknowledgments

- **Langflow Team** - For the amazing visual flow builder
- **Anthropic** - For Claude AI and MCP protocol
- **Railway** - For seamless deployment infrastructure

---

**Built with ❤️ for the Langflow community**