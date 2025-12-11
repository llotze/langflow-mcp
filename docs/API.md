# API Reference

Complete HTTP/REST API documentation for the Langflow MCP Server.

**Base URL (Production)**: `https://langflow-mcp-production.up.railway.app`  
**Base URL (Local)**: `http://localhost:3001`

---

## 📋 Table of Contents

- [Authentication](#-authentication)
- [Health Check](#-health-check)
- [Flow Operations](#-flow-operations)
- [Component Discovery](#-component-discovery)
- [Template Management](#-template-management)
- [Hopper Assistant](#-hopper-assistant)
- [Real-Time Updates](#-real-time-updates)
- [Error Handling](#-error-handling)

---

## 🔐 Authentication

All endpoints (except `/health`) require user authentication via API key.

### **Header**

```
x-api-key: lf_your_langflow_api_key_here
```

### **Obtaining an API Key**

1. Go to your Langflow instance → **Settings** → **API Keys**
2. Click **"Create New API Key"**
3. Copy the generated key (format: `lf_xxxxxxxxxxxxxxxx`)
4. Use in all API requests

### **Error Response (401 Unauthorized)**

```json
{
  "success": false,
  "error": "API key required",
  "instructions": {
    "message": "Please set your Langflow API key to use Hopper",
    "steps": [
      "1. Go to Langflow Settings → API Keys",
      "2. Click 'Create New API Key'",
      "3. Copy the generated key",
      "4. Paste it in the Hopper chat settings"
    ]
  }
}
```

---

## 🏥 Health Check

### **GET /health**

Check server status and configuration.

**Authentication**: ❌ Not required

#### **Request**

```bash
curl https://langflow-mcp-production.up.railway.app/health
```

#### **Response (200 OK)**

```json
{
  "status": "ok",
  "message": "Langflow MCP Server is running",
  "langflowApiEnabled": true,
  "timestamp": "2025-12-10T23:50:00.000Z"
}
```

---

## ⚙️ Flow Operations

### **POST /mcp/api/tweak-flow/:flowId**

Apply differential operations to modify an existing flow.

**Authentication**: ✅ Required

#### **URL Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `flowId` | `string` | UUID of the flow to modify |

#### **Request Body**

```json
{
  "flowId": "abc-123",
  "operations": [
    {
      "type": "updateNode",
      "nodeId": "OpenAI-xyz",
      "updates": {
        "template": {
          "temperature": 0.9,
          "model_name": "gpt-4o-mini"
        }
      },
      "merge": true
    }
  ]
}
```

#### **Operation Types**

##### **1. Update Node**

```json
{
  "type": "updateNode",
  "nodeId": "node_id",
  "updates": {
    "template": {
      "parameter_name": "new_value"
    }
  },
  "merge": true
}
```

##### **2. Add Single Node**

```json
{
  "type": "addNode",
  "nodeId": "openai_1",
  "component": "OpenAIModel",
  "params": {
    "model_name": "gpt-4o-mini",
    "temperature": 0.7
  },
  "position": { "x": 400, "y": 200 }
}
```

##### **3. Bulk Add Nodes (Recommended)**

```json
{
  "type": "addNodes",
  "nodes": [
    {
      "nodeId": "input_1",
      "component": "ChatInput",
      "params": {}
    },
    {
      "nodeId": "llm_1",
      "component": "OpenAIModel",
      "params": { "model_name": "gpt-4o-mini" }
    },
    {
      "nodeId": "output_1",
      "component": "ChatOutput",
      "params": {}
    }
  ],
  "autoLayout": "horizontal",
  "spacing": 350
}
```

**Benefits**:
- ✅ 80-90% faster than individual operations
- ✅ Single validation pass
- ✅ Automatic layout positioning

##### **4. Remove Node**

```json
{
  "type": "removeNode",
  "nodeId": "node_to_remove",
  "removeConnections": true
}
```

##### **5. Bulk Remove Nodes**

```json
{
  "type": "removeNodes",
  "nodeIds": ["node1", "node2", "node3"],
  "removeConnections": true
}
```

##### **6. Add Edge**

```json
{
  "type": "addEdge",
  "source": "input_1",
  "target": "llm_1",
  "targetParam": "input_value"
}
```

##### **7. Bulk Add Edges**

```json
{
  "type": "addEdges",
  "edges": [
    {
      "source": "input_1",
      "target": "llm_1",
      "targetParam": "input_value"
    },
    {
      "source": "llm_1",
      "target": "output_1",
      "targetParam": "input_value"
    }
  ]
}
```

##### **8. Remove Edge**

```json
{
  "type": "removeEdge",
  "source": "node1",
  "target": "node2"
}
```

##### **9. Add Note/README**

```json
{
  "type": "addNote",
  "markdown": "# Flow Documentation\n\nThis flow...",
  "position": { "x": 100, "y": 100 },
  "backgroundColor": "neutral"
}
```

#### **Response (200 OK)**

```json
{
  "success": true,
  "flowId": "abc-123",
  "name": "My Flow",
  "operationsApplied": 3,
  "warnings": [],
  "message": "Flow abc-123 updated successfully with 3 operations"
}
```

#### **Response (500 Error)**

```json
{
  "error": "Node 'invalid-id' not found in flow"
}
```

#### **Example: Create Basic Chatbot**

```bash
curl -X POST https://langflow-mcp-production.up.railway.app/mcp/api/tweak-flow/abc-123 \
  -H "Content-Type: application/json" \
  -H "x-api-key: lf_your_key" \
  -d '{
    "flowId": "abc-123",
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
  }'
```

---

### **POST /mcp/api/run-flow/:flowId**

Execute a flow with provided inputs.

**Authentication**: ✅ Required

#### **URL Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `flowId` | `string` | UUID of the flow to execute |

#### **Request Body**

```json
{
  "input_value": "Hello, how are you?",
  "session_id": "user-session-123",
  "input_type": "chat",
  "output_type": "chat",
  "tweaks": {
    "OpenAI-xyz": {
      "temperature": 0.7
    }
  }
}
```

#### **Response (200 OK)**

```json
{
  "success": true,
  "flowId": "abc-123",
  "outputCount": 1,
  "message": "Flow abc-123 executed successfully"
}
```

---

### **GET /mcp/api/flow-details/:flowId**

Retrieve complete flow structure including all nodes and edges.

**Authentication**: ✅ Required  
**Warning**: ⚠️ Returns large payloads - use sparingly

#### **URL Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `flowId` | `string` | UUID of the flow to retrieve |

#### **Request**

```bash
curl https://langflow-mcp-production.up.railway.app/mcp/api/flow-details/abc-123 \
  -H "x-api-key: lf_your_key"
```

#### **Response (200 OK)**

```json
{
  "success": true,
  "flow": {
    "id": "abc-123",
    "name": "My Chatbot",
    "description": "A simple chatbot",
    "data": {
      "nodes": [...],
      "edges": [...],
      "viewport": { "x": 0, "y": 0, "zoom": 1 }
    },
    "updated_at": "2025-12-10T23:30:00Z"
  }
}
```

---

## 🔍 Component Discovery

### **GET /mcp/api/search**

Search for Langflow components by keyword.

**Authentication**: ✅ Required

#### **Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `keyword` | `string` | ✅ Yes | Search term (name, description) |
| `limit` | `number` | ❌ No | Max results (default: 20) |

#### **Request**

```bash
curl "https://langflow-mcp-production.up.railway.app/mcp/api/search?keyword=openai&limit=10" \
  -H "x-api-key: lf_your_key"
```

#### **Response (200 OK)**

```json
{
  "success": true,
  "data": [
    {
      "name": "OpenAIModel",
      "display_name": "OpenAI",
      "description": "OpenAI language models",
      "category": "models",
      "base_classes": ["LanguageModel"],
      "icon": "OpenAI",
      "beta": false,
      "legacy": false
    },
    {
      "name": "OpenAIEmbeddings",
      "display_name": "OpenAI Embeddings",
      "description": "Generate embeddings using OpenAI models",
      "category": "embeddings",
      "base_classes": ["Embeddings"],
      "icon": "OpenAI",
      "beta": false,
      "legacy": false
    }
  ]
}
```

---

### **GET /mcp/api/components/:componentName**

Get full template and configuration for a component.

**Authentication**: ✅ Required

#### **URL Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `componentName` | `string` | Component name (e.g., "OpenAIModel") |

#### **Request**

```bash
curl https://langflow-mcp-production.up.railway.app/mcp/api/components/OpenAIModel \
  -H "x-api-key: lf_your_key"
```

#### **Response (200 OK)**

```json
{
  "success": true,
  "data": {
    "name": "OpenAIModel",
    "display_name": "OpenAI",
    "description": "OpenAI language models",
    "category": "models",
    "template": {
      "model_name": {
        "name": "model_name",
        "display_name": "Model Name",
        "type": "string",
        "required": true,
        "options": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
        "value": "gpt-4o-mini"
      },
      "temperature": {
        "name": "temperature",
        "display_name": "Temperature",
        "type": "float",
        "required": false,
        "value": 0.7,
        "range": [0, 2]
      },
      "api_key": {
        "name": "api_key",
        "display_name": "API Key",
        "type": "string",
        "required": true,
        "password": true
      }
    },
    "parameters": [
      {
        "name": "model_name",
        "type": "string",
        "required": true,
        "default": "gpt-4o-mini"
      }
    ],
    "base_classes": ["LanguageModel"],
    "outputs": [
      {
        "name": "text_output",
        "types": ["Message"]
      }
    ]
  }
}
```

---

### **GET /mcp/api/component-essentials/:componentName**

Get only the most important properties (filtered view).

**Authentication**: ✅ Required

#### **URL Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `componentName` | `string` | Component name |

#### **Request**

```bash
curl https://langflow-mcp-production.up.railway.app/mcp/api/component-essentials/OpenAIModel \
  -H "x-api-key: lf_your_key"
```

#### **Response (200 OK)**

```json
{
  "success": true,
  "data": {
    "componentName": "OpenAIModel",
    "displayName": "OpenAI",
    "description": "OpenAI language models",
    "requiredParameters": [
      {
        "name": "model_name",
        "type": "string",
        "required": true
      },
      {
        "name": "api_key",
        "type": "string",
        "required": true,
        "password": true
      }
    ],
    "commonParameters": [
      {
        "name": "temperature",
        "type": "float",
        "default": 0.7
      },
      {
        "name": "max_tokens",
        "type": "int",
        "default": null
      }
    ],
    "metadata": {
      "totalParameters": 12
    }
  }
}
```

---

### **GET /mcp/api/search-component-properties/:componentName**

Search for specific properties within a component.

**Authentication**: ✅ Required

#### **URL Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `componentName` | `string` | Component name |

#### **Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | `string` | ✅ Yes | Search term for property |

#### **Request**

```bash
curl "https://langflow-mcp-production.up.railway.app/mcp/api/search-component-properties/OpenAIModel?query=temperature" \
  -H "x-api-key: lf_your_key"
```

#### **Response (200 OK)**

```json
{
  "success": true,
  "data": {
    "componentName": "OpenAIModel",
    "query": "temperature",
    "matches": [
      {
        "name": "temperature",
        "display_name": "Temperature",
        "type": "float",
        "description": "Controls randomness in responses",
        "default": 0.7
      }
    ],
    "totalMatches": 1,
    "searchedIn": 12
  }
}
```

---

## 📦 Template Management

### **GET /mcp/api/search-templates**

Search pre-built flow templates.

**Authentication**: ✅ Required

#### **Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `keyword` | `string` | ❌ No | Search term |
| `tags` | `string` | ❌ No | Comma-separated tags |
| `category` | `string` | ❌ No | Template category |
| `page` | `number` | ❌ No | Page number (default: 1) |
| `pageSize` | `number` | ❌ No | Results per page (default: 20) |

#### **Request**

```bash
curl "https://langflow-mcp-production.up.railway.app/mcp/api/search-templates?keyword=chatbot" \
  -H "x-api-key: lf_your_key"
```

#### **Response (200 OK)**

```json
{
  "total": 5,
  "page": 1,
  "pageSize": 20,
  "results": [
    {
      "id": "basic-chatbot",
      "name": "Basic Chatbot",
      "description": "Simple conversational agent",
      "tags": ["chatbot", "beginner"],
      "category": "chatbots"
    }
  ]
}
```

---

### **GET /mcp/api/get-template/:templateId**

Get full template definition.

**Authentication**: ✅ Required

#### **URL Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `templateId` | `string` | Template identifier |

#### **Request**

```bash
curl https://langflow-mcp-production.up.railway.app/mcp/api/get-template/basic-chatbot \
  -H "x-api-key: lf_your_key"
```

#### **Response (200 OK)**

```json
{
  "id": "basic-chatbot",
  "name": "Basic Chatbot",
  "description": "Simple conversational agent",
  "data": {
    "nodes": [...],
    "edges": [...]
  },
  "tags": ["chatbot", "beginner"]
}
```

---

### **POST /mcp/api/create-flow-from-template/:templateId**

Create a new flow from a template.

**Authentication**: ✅ Required

#### **URL Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `templateId` | `string` | Template identifier |

#### **Request Body**

```json
{
  "name": "My Chatbot",
  "description": "Custom chatbot based on template"
}
```

#### **Request**

```bash
curl -X POST https://langflow-mcp-production.up.railway.app/mcp/api/create-flow-from-template/basic-chatbot \
  -H "Content-Type: application/json" \
  -H "x-api-key: lf_your_key" \
  -d '{
    "name": "My Custom Chatbot"
  }'
```

#### **Response (200 OK)**

```json
{
  "success": true,
  "flowId": "new-flow-uuid",
  "name": "My Custom Chatbot",
  "message": "Flow created successfully. ID: new-flow-uuid"
}
```

---

## 🤖 Hopper Assistant

### **POST /mcp/api/assistant**

Interact with the Hopper AI assistant (Claude-powered).

**Authentication**: ✅ Required

#### **Request Body**

```json
{
  "flow_id": "abc-123",
  "session_id": "user-session-456",
  "message": "Add an OpenAI model to my flow with temperature 0.9"
}
```

#### **Request**

```bash
curl -X POST https://langflow-mcp-production.up.railway.app/mcp/api/assistant \
  -H "Content-Type: application/json" \
  -H "x-api-key: lf_your_key" \
  -d '{
    "flow_id": "abc-123",
    "session_id": "user-123",
    "message": "What components are available for text generation?"
  }'
```

#### **Response (200 OK)**

```json
{
  "success": true,
  "reply": "I found several components for text generation:\n\n1. **OpenAI** - Most popular, supports GPT-4o and GPT-4o-mini\n2. **Anthropic** - Claude models (Sonnet, Opus, Haiku)\n3. **HuggingFace** - Open-source models\n\nWould you like me to add one to your flow?"
}
```

### **Hopper Capabilities**

Hopper can:
- ✅ Search for components and explain their usage
- ✅ Modify flows using `tweak_flow` tool
- ✅ Suggest improvements and best practices
- ✅ Debug flow issues
- ✅ Build flows from natural language descriptions

---

## 🔄 Real-Time Updates

### **GET /mcp/api/flow-updates/:flowId**

Subscribe to real-time flow updates via Server-Sent Events (SSE).

**Authentication**: ❌ Not required (public stream)

#### **URL Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `flowId` | `string` | Flow UUID to monitor |

#### **Request**

```javascript
const eventSource = new EventSource(
  'https://langflow-mcp-production.up.railway.app/mcp/api/flow-updates/abc-123'
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Flow updated:', data);
};

eventSource.onerror = () => {
  console.error('SSE connection error');
  eventSource.close();
};
```

#### **Event Format**

```json
{
  "type": "flow_updated",
  "flowId": "abc-123",
  "operationsApplied": 2,
  "timestamp": 1702420800000
}
```

---

## ❌ Error Handling

### **Standard Error Response**

```json
{
  "success": false,
  "error": "Error message here",
  "details": "Additional context if available"
}
```

### **HTTP Status Codes**

| Code | Meaning | Description |
|------|---------|-------------|
| `200` | OK | Request successful |
| `400` | Bad Request | Invalid request parameters |
| `401` | Unauthorized | Missing or invalid API key |
| `404` | Not Found | Resource not found |
| `500` | Internal Server Error | Server-side error |

### **Common Errors**

#### **1. Missing API Key**

```json
{
  "success": false,
  "error": "API key required",
  "instructions": {
    "message": "Please set your Langflow API key",
    "steps": [...]
  }
}
```

#### **2. Node Not Found**

```json
{
  "error": "Node 'invalid-node-id' not found in flow"
}
```

#### **3. Validation Error**

```json
{
  "success": false,
  "errors": [
    "Missing required parameter: 'api_key' in node 'OpenAI-xyz'"
  ],
  "operationsApplied": 0
}
```

#### **4. Component Not Found**

```json
{
  "success": false,
  "error": "Component 'InvalidComponent' not found in Langflow"
}
```

---

## 📊 Rate Limits

Currently **no rate limits** are enforced. However, be mindful of:

- ⚠️ Large payloads (flow details endpoint)
- ⚠️ Bulk operations (use bulk endpoints instead of loops)
- ⚠️ SSE connections (close when done)

---

## 🔗 Related Documentation

- [README.md](../README.md) - Project overview and setup
- [Langflow Documentation](https://docs.langflow.org)
- [MCP Protocol Specification](https://spec.modelcontextprotocol.io)

---

**Last Updated**: December 10, 2025  
**API Version**: 1.0.0  
**Production URL**: `https://langflow-mcp-production.up.railway.app`