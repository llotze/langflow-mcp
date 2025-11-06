# Langflow MCP Server - Architecture & Flow Documentation

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Overview](#architecture-overview)
3. [File Structure](#file-structure)
4. [Core Components](#core-components)
5. [Data Flow](#data-flow)
6. [API Endpoints](#api-endpoints)
7. [Database Schema](#database-schema)
8. [Search Implementation](#search-implementation)
9. [Component Extraction Process](#component-extraction-process)
10. [Flow Building](#flow-building)
11. [How to Extend](#how-to-extend)

---

## 📋 Project Overview

### What Is This?

The **Langflow MCP Server** is a REST API that provides programmatic access to Langflow components. It enables AI assistants (like Claude, ChatGPT) to:

- Discover available Langflow components (334 components across 90 categories)
- Search components by keyword or category
- Get detailed component information (parameters, types, documentation)
- Build and modify Langflow workflows programmatically
- Access pre-built flow templates

### Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Web Framework**: Express.js 5.1
- **Database**: SQLite (better-sqlite3)
- **HTTP Client**: Axios
- **Development**: ts-node, TypeScript 5.9

### Key Metrics

- **334 Components** loaded from Langflow
- **90 Categories** (openai, anthropic, models, embeddings, etc.)
- **11 API Endpoints** for component discovery and flow building
- **Full-text search** with filtering capabilities

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT (AI Assistant)                     │
│              HTTP Requests (JSON payloads)                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   EXPRESS SERVER (server.ts)                 │
│  • Routes HTTP requests to handlers                          │
│  • Initializes components on startup                         │
│  • Manages server lifecycle                                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    MCP TOOLS (tools.ts)                      │
│  • Business logic for each endpoint                          │
│  • Request/response handling                                 │
│  • Error handling                                            │
└────────────────────────┬────────────────────────────────────┘
                         │
           ┌─────────────┴─────────────┐
           ▼                           ▼
┌──────────────────────┐    ┌──────────────────────┐
│  COMPONENT REGISTRY  │    │ COMPONENT EXTRACTOR  │
│    (registry.ts)     │    │ (componentExtractor) │
│                      │    │                      │
│ • Database queries   │    │ • JSON parsing       │
│ • CRUD operations    │    │ • Type mapping       │
│ • Search logic       │    │ • Docs loading       │
└──────────┬───────────┘    └──────────┬───────────┘
           │                           │
           ▼                           ▼
┌──────────────────────┐    ┌──────────────────────┐
│  SQLITE DATABASE     │    │   DATA FILES         │
│  (langflow.db)       │    │  • components.json   │
│                      │    │  • templates/*.json  │
│ • components table   │    │  • docs/*.mdx        │
│ • Full-text search   │    │                      │
└──────────────────────┘    └──────────────────────┘
```

### Design Principles

1. **Separation of Concerns**: Each file has a single responsibility
2. **Type Safety**: TypeScript interfaces define all data structures
3. **Modularity**: Easy to add new endpoints or modify existing ones
4. **Performance**: Database indexing for fast searches
5. **Error Handling**: Try-catch blocks with meaningful error messages

---

## 📁 File Structure

```
langflow-mcp/
├── src/
│   ├── server.ts              # Entry point, Express setup, startup logic
│   ├── config.ts              # Configuration loader (.env + defaults)
│   ├── types.ts               # TypeScript interfaces & type definitions
│   ├── componentExtractor.ts # Parses components.json into structured data
│   ├── registry.ts            # Database operations (CRUD + search)
│   └── tools.ts               # API endpoint handlers (business logic)
│
├── data/
│   ├── components.json        # 334 Langflow components (source of truth)
│   ├── langflow.db            # SQLite database (auto-generated)
│   ├── templates/             # Flow templates (JSON files)
│   │   └── Vector Store RAG.json
│   └── docs/                  # Component documentation (MDX files)
│
├── package.json               # Dependencies & scripts
├── tsconfig.json              # TypeScript configuration
├── .env.example               # Environment variable template
└── README.md                  # Project documentation
```

---

## 🔧 Core Components

### 1. **server.ts** - The Orchestrator

**Purpose**: Entry point that initializes and coordinates all components.

**Key Functions**:

```typescript
async function main() {
  // 1. Load configuration
  const config = loadConfig();
  
  // 2. Initialize database
  const registry = new ComponentRegistry(config.databasePath);
  
  // 3. Parse Langflow components
  const extractor = new ComponentExtractor(
    config.componentsJsonPath,
    config.docsPath
  );
  const components = extractor.loadComponents();
  
  // 4. Store components in database
  for (const component of components) {
    await registry.registerComponent(component);
  }
  
  // 5. Setup API endpoints
  const mcpTools = new MCPTools(registry, extractor, config);
  
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/mcp/list_components', (req, res) => 
    mcpTools.listComponents(req, res)
  );
  // ... 9 more endpoints
  
  // 6. Start server
  app.listen(config.port);
}
```

**Flow**:
1. Reads configuration from `.env` or uses defaults
2. Creates SQLite database (if doesn't exist)
3. Loads and parses `components.json` (334 components)
4. Stores components in database with search text
5. Registers Express routes
6. Starts HTTP server on port 3000

**When to modify**: Adding new startup tasks, changing server configuration, adding middleware.

---

### 2. **config.ts** - Configuration Manager

**Purpose**: Centralized configuration loading with environment variable support.

**Structure**:

```typescript
export interface Config {
  port: number;                    // Server port (default: 3000)
  componentsJsonPath: string;      // Path to components.json
  flowTemplatesPath: string;       // Path to templates/
  docsPath: string;                // Path to docs/
  databasePath: string;            // Path to langflow.db
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT || '3000'),
    componentsJsonPath: process.env.COMPONENTS_JSON_PATH || 
      path.join(__dirname, '..', 'data', 'components.json'),
    // ... other paths
  };
}
```

**Environment Variables** (`.env`):
- `PORT` - Server port
- `COMPONENTS_JSON_PATH` - Custom components.json location
- `FLOW_TEMPLATES_PATH` - Custom templates directory
- `DOCS_PATH` - Custom docs directory
- `DATABASE_PATH` - Custom database location

**When to modify**: Adding new configuration options, changing default paths.

---

### 3. **types.ts** - Type Definitions

**Purpose**: TypeScript interfaces that define the shape of all data structures.

**Key Interfaces**:

```typescript
// A Langflow component (e.g., OpenAIModel, ChatInput)
export interface LangflowComponent {
  name: string;              // "OpenAIModel"
  display_name: string;      // "OpenAI"
  description: string;       // "Interact with OpenAI models"
  category: string;          // "openai"
  subcategory?: string;      // "chat_models"
  parameters: ComponentParameter[];  // Input fields
  input_types?: string[];    // ["Message", "Text"]
  output_types?: string[];   // ["Message"]
  tool_mode?: boolean;       // Can be used as a tool
  legacy?: boolean;          // Legacy component
  beta?: boolean;            // Beta/experimental
  documentation_link?: string;
  icon?: string;
  base_classes?: string[];   // Inheritance info
  frozen?: boolean;          // Cannot be modified
  field_order?: string[];    // UI field ordering
}

// A component parameter (e.g., api_key, model_name)
export interface ComponentParameter {
  name: string;              // "api_key"
  display_name: string;      // "API Key"
  type: string;              // "string" | "number" | "boolean"
  required: boolean;         // true
  default?: any;             // Default value
  description?: string;      // Help text
  options?: string[] | any[]; // Dropdown options
  placeholder?: string;      // UI placeholder
  password?: boolean;        // Mask input (for secrets)
  multiline?: boolean;       // Textarea vs input
  file_types?: string[];     // Accepted file types
  input_types?: string[];    // Accepted input types
  load_from_db?: boolean;    // Load from database
}

// Search query structure
export interface ComponentSearchQuery {
  query?: string;            // Text search
  category?: string;         // Filter by category
  limit?: number;            // Max results
  tool_mode?: boolean;       // Only tool-capable
  legacy?: boolean;          // Include/exclude legacy
}

// Flow structure
export interface LangflowFlow {
  name: string;
  description?: string;
  data: {
    nodes: FlowNode[];       // Component instances
    edges: FlowEdge[];       // Connections
  };
  tags?: string[];
  metadata?: Record<string, any>;
}

// API response format
export interface MCPToolResponse {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}
```

**When to modify**: Adding new fields to components, creating new data structures.

---

### 4. **componentExtractor.ts** - JSON Parser

**Purpose**: Reads and parses Langflow's `components.json` into structured objects.

**Class Structure**:

```typescript
export class ComponentExtractor {
  private componentsJsonPath: string;
  private docsPath: string;

  // Main entry point: Load all components
  public loadComponents(): LangflowComponent[] {
    const componentsData = JSON.parse(
      fs.readFileSync(this.componentsJsonPath, 'utf-8')
    );
    return this.parseComponents(componentsData);
  }

  // Parse all categories and components
  private parseComponents(componentsData: any): LangflowComponent[] {
    const components: LangflowComponent[] = [];
    
    // Loop through categories (openai, anthropic, etc.)
    for (const [category, categoryData] of Object.entries(componentsData)) {
      // Loop through components in category
      for (const [name, comp] of Object.entries(categoryData as any)) {
        components.push(
          this.parseComponent(comp, name, category)
        );
      }
    }
    
    return components;
  }

  // Parse a single component
  private parseComponent(
    comp: any, 
    name: string, 
    category: string
  ): LangflowComponent {
    return {
      name,
      display_name: comp.display_name || name,
      description: comp.description || '',
      category,
      subcategory: comp.subcategory,
      parameters: this.extractParameters(comp.template || {}),
      input_types: this.extractInputTypes(comp.template),
      output_types: comp.output_types || [],
      tool_mode: comp.tool_mode || false,
      legacy: comp.legacy || false,
      beta: comp.beta || false,
      // ... other fields
    };
  }

  // Extract parameters from template
  private extractParameters(template: any): ComponentParameter[] {
    const params: ComponentParameter[] = [];
    
    for (const [key, value] of Object.entries(template)) {
      const field = value as any;
      params.push({
        name: key,
        display_name: field.display_name || key,
        type: this.mapLangflowType(field.type),
        required: field.required || false,
        default: field.value,
        description: field.info || '',
        options: field.options,
        password: field.password || false,
        // ... other fields
      });
    }
    
    return params;
  }

  // Map Langflow types to standard types
  private mapLangflowType(langflowType: string): string {
    const typeMap: Record<string, string> = {
      'str': 'string',
      'int': 'number',
      'float': 'number',
      'bool': 'boolean',
      'dict': 'object',
      'list': 'array',
      // ... more mappings
    };
    return typeMap[langflowType] || 'string';
  }
}
```

**Data Transformation Example**:

Input (`components.json`):
```json
{
  "openai": {
    "OpenAIModel": {
      "display_name": "OpenAI",
      "description": "Interact with OpenAI models",
      "template": {
        "api_key": {
          "type": "str",
          "required": true,
          "password": true,
          "display_name": "API Key"
        },
        "model_name": {
          "type": "str",
          "default": "gpt-4",
          "options": ["gpt-3.5-turbo", "gpt-4"]
        }
      }
    }
  }
}
```

Output (`LangflowComponent`):
```typescript
{
  name: "OpenAIModel",
  display_name: "OpenAI",
  description: "Interact with OpenAI models",
  category: "openai",
  parameters: [
    {
      name: "api_key",
      display_name: "API Key",
      type: "string",
      required: true,
      password: true
    },
    {
      name: "model_name",
      display_name: "Model Name",
      type: "string",
      required: false,
      default: "gpt-4",
      options: ["gpt-3.5-turbo", "gpt-4"]
    }
  ]
}
```

**When to modify**: 
- Langflow changes their JSON structure
- Need to parse new component fields
- Want to add custom component sources

---

### 5. **registry.ts** - Database Manager

**Purpose**: Manages SQLite database operations (CRUD + search).

**Database Schema**:

```sql
CREATE TABLE components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  description TEXT,
  category TEXT,
  subcategory TEXT,
  
  -- JSON serialized data
  template_schema TEXT,
  parameters_schema TEXT,
  base_classes TEXT,
  input_types TEXT,
  output_types TEXT,
  field_order TEXT,
  
  -- Flags
  tool_mode BOOLEAN DEFAULT 0,
  legacy BOOLEAN DEFAULT 0,
  beta BOOLEAN DEFAULT 0,
  frozen BOOLEAN DEFAULT 0,
  
  -- Documentation
  documentation_link TEXT,
  documentation_content TEXT,
  
  -- UI
  icon TEXT,
  
  -- Search (combined text of name, display_name, description, category)
  search_text TEXT,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast queries
CREATE INDEX idx_components_category ON components(category);
CREATE INDEX idx_components_name ON components(name);
CREATE INDEX idx_components_tool_mode ON components(tool_mode);
CREATE INDEX idx_components_legacy ON components(legacy);
CREATE INDEX idx_components_search ON components(search_text);
```

**Key Methods**:

```typescript
export class ComponentRegistry {
  private db: Database.Database;

  constructor(databasePath: string) {
    this.db = new Database(databasePath);
    this.initializeDatabase();  // Create tables if not exist
  }

  // Create database schema
  private initializeDatabase(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS components (...)`);
  }

  // Insert/update a component
  public async registerComponent(
    component: LangflowComponent, 
    docs?: string
  ): Promise<void> {
    // Create searchable text from all fields
    const searchText = `${component.name} ${component.display_name} ${component.description} ${component.category}`.toLowerCase();

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO components (...)
      VALUES (?, ?, ?, ...)
    `);

    stmt.run(
      component.name,
      component.display_name,
      component.description,
      component.category,
      JSON.stringify(component.parameters),
      // ... other fields
      searchText  // ← Used for search
    );
  }

  // Get all components
  public getAllComponents(): LangflowComponent[] {
    const stmt = this.db.prepare(
      'SELECT * FROM components ORDER BY category, name'
    );
    const rows = stmt.all() as any[];
    return rows.map(row => this.rowToComponent(row));
  }

  // Search components
  public searchComponents(
    query: ComponentSearchQuery
  ): LangflowComponent[] {
    let sql = 'SELECT * FROM components WHERE 1=1';
    const params: any[] = [];

    // Filter by category
    if (query.category) {
      sql += ' AND category = ?';
      params.push(query.category);
    }

    // Filter by tool_mode
    if (query.tool_mode !== undefined) {
      sql += ' AND tool_mode = ?';
      params.push(query.tool_mode ? 1 : 0);
    }

    // Text search using LIKE
    if (query.query) {
      sql += ' AND search_text LIKE ?';
      params.push(`%${query.query.toLowerCase()}%`);
    }

    sql += ' ORDER BY category, name';

    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    return rows.map(row => this.rowToComponent(row));
  }

  // Get single component by name
  public getComponent(name: string): LangflowComponent | null {
    const stmt = this.db.prepare(
      'SELECT * FROM components WHERE name = ?'
    );
    const row = stmt.get(name) as any;
    return row ? this.rowToComponent(row) : null;
  }

  // Convert database row to component object
  private rowToComponent(row: any): LangflowComponent {
    return {
      name: row.name,
      display_name: row.display_name,
      description: row.description,
      category: row.category,
      parameters: JSON.parse(row.parameters_schema || '[]'),
      // ... other fields (parse JSON strings back to objects)
    };
  }
}
```

**Search Implementation Details**:

The search uses SQL `LIKE` with wildcards:

```sql
-- When searching for "openai"
SELECT * FROM components 
WHERE search_text LIKE '%openai%'

-- search_text example:
-- "openaimodel openai interact with openai large language models openai"
```

This matches if "openai" appears **anywhere** in:
- Component name
- Display name  
- Description
- Category

**When to modify**:
- Need more complex queries
- Want to add full-text search (FTS5)
- Need to index additional fields
- Want to add caching

---

### 6. **tools.ts** - API Handlers

**Purpose**: Business logic for each API endpoint.

**Class Structure**:

```typescript
export class MCPTools {
  private registry: ComponentRegistry;
  private extractor: ComponentExtractor;
  private config: Config;

  constructor(
    registry: ComponentRegistry,
    extractor: ComponentExtractor,
    config: Config
  ) {
    this.registry = registry;
    this.extractor = extractor;
    this.config = config;
  }

  // 1. List all components
  public async listComponents(req: Request, res: Response): Promise<void> {
    try {
      const components = await this.registry.getAllComponents();
      res.json({ success: true, data: components });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to list components' 
      });
    }
  }

  // 2. Search components
  public async searchComponents(req: Request, res: Response): Promise<void> {
    try {
      const query: ComponentSearchQuery = req.body;
      const components = await this.registry.searchComponents(query);
      res.json({ success: true, data: components });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to search components' 
      });
    }
  }

  // 3. Get component essentials
  public async getComponentEssentials(
    req: Request, 
    res: Response
  ): Promise<void> {
    try {
      const { name } = req.params;
      const component = await this.registry.getComponent(name);
      
      if (!component) {
        return res.status(404).json({ 
          success: false, 
          error: 'Component not found' 
        });
      }
      
      res.json({ success: true, data: component });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get component' 
      });
    }
  }

  // 4. Get component documentation
  public async getComponentDocs(
    req: Request, 
    res: Response
  ): Promise<void> {
    try {
      const { name } = req.params;
      const docs = this.extractor.loadComponentDocs(name);
      
      if (!docs) {
        return res.status(404).json({ 
          success: false, 
          error: 'Documentation not found' 
        });
      }
      
      res.json({ success: true, data: { documentation: docs } });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get documentation' 
      });
    }
  }

  // 5. Validate component configuration
  public async validateComponentConfig(
    req: Request, 
    res: Response
  ): Promise<void> {
    try {
      const { component_name, config } = req.body;
      const component = await this.registry.getComponent(component_name);
      
      if (!component) {
        return res.status(404).json({ 
          success: false, 
          error: 'Component not found' 
        });
      }
      
      // Validate required parameters
      const missing = component.parameters
        .filter(p => p.required && !config[p.name])
        .map(p => p.name);
      
      if (missing.length > 0) {
        return res.json({
          success: false,
          error: 'Missing required parameters',
          data: { missing_parameters: missing }
        });
      }
      
      res.json({ 
        success: true, 
        data: { valid: true } 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to validate config' 
      });
    }
  }

  // 6. Create a new flow
  public async createFlow(req: Request, res: Response): Promise<void> {
    try {
      const { name, description, nodes, edges } = req.body;
      
      // Validate all nodes reference valid components
      for (const node of nodes) {
        const component = await this.registry.getComponent(node.type);
        if (!component) {
          return res.status(400).json({
            success: false,
            error: `Unknown component: ${node.type}`
          });
        }
      }
      
      const flow: LangflowFlow = {
        name,
        description,
        data: { nodes, edges }
      };
      
      res.json({ 
        success: true, 
        data: flow,
        message: 'Flow created successfully' 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to create flow' 
      });
    }
  }

  // 7. Update flow with diff operations
  public async updateFlowPartial(
    req: Request, 
    res: Response
  ): Promise<void> {
    try {
      const { flow, operations } = req.body;
      let updatedFlow = { ...flow };
      
      for (const op of operations) {
        updatedFlow = this.applyOperation(updatedFlow, op);
      }
      
      res.json({ 
        success: true, 
        data: updatedFlow,
        message: `Applied ${operations.length} operations successfully` 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to update flow' 
      });
    }
  }

  // Helper: Apply a single diff operation
  private applyOperation(
    flow: LangflowFlow, 
    op: FlowDiffOperation
  ): LangflowFlow {
    const updatedFlow = { ...flow };
    
    switch (op.operation) {
      case 'addNode':
        if (op.node) {
          updatedFlow.data.nodes.push(op.node);
        }
        break;
        
      case 'removeNode':
        updatedFlow.data.nodes = updatedFlow.data.nodes.filter(
          n => n.id !== op.nodeId
        );
        updatedFlow.data.edges = updatedFlow.data.edges.filter(
          e => e.source !== op.nodeId && e.target !== op.nodeId
        );
        break;
        
      case 'updateNode':
        if (op.nodeId && op.updates) {
          const nodeIndex = updatedFlow.data.nodes.findIndex(
            n => n.id === op.nodeId
          );
          if (nodeIndex !== -1) {
            updatedFlow.data.nodes[nodeIndex] = {
              ...updatedFlow.data.nodes[nodeIndex],
              ...op.updates,
            };
          }
        }
        break;
        
      case 'addConnection':
        if (op.edge) {
          updatedFlow.data.edges.push(op.edge);
        }
        break;
        
      case 'removeConnection':
        if (op.edge) {
          updatedFlow.data.edges = updatedFlow.data.edges.filter(
            e => !(e.source === op.edge!.source && 
                   e.target === op.edge!.target)
          );
        }
        break;
        
      case 'updateFlowMetadata':
        if (op.metadata) {
          updatedFlow.metadata = { 
            ...updatedFlow.metadata, 
            ...op.metadata 
          };
        }
        break;
    }
    
    return updatedFlow;
  }

  // 8. List flow templates
  public async listFlowTemplates(
    req: Request, 
    res: Response
  ): Promise<void> {
    try {
      const templatesPath = this.config.flowTemplatesPath;
      
      if (!fs.existsSync(templatesPath)) {
        return res.json({ success: true, data: [] });
      }
      
      const files = fs.readdirSync(templatesPath)
        .filter(f => f.endsWith('.json'));
      
      const templates = files.map(file => {
        const content = JSON.parse(
          fs.readFileSync(path.join(templatesPath, file), 'utf-8')
        );
        return {
          name: content.name || file.replace('.json', ''),
          description: content.description || '',
          file: file
        };
      });
      
      res.json({ success: true, data: templates });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to list templates' 
      });
    }
  }

  // 9. Get specific flow template
  public async getFlowTemplate(
    req: Request, 
    res: Response
  ): Promise<void> {
    try {
      const { name } = req.params;
      const templatesPath = this.config.flowTemplatesPath;
      const filePath = path.join(templatesPath, `${name}.json`);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ 
          success: false, 
          error: 'Template not found' 
        });
      }
      
      const template = JSON.parse(
        fs.readFileSync(filePath, 'utf-8')
      );
      
      res.json({ success: true, data: template });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get template' 
      });
    }
  }

  // 10. Get all categories
  public async getCategories(req: Request, res: Response): Promise<void> {
    try {
      const categories = await this.registry.getCategories();
      res.json({ success: true, data: categories });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get categories' 
      });
    }
  }
}
```

**When to modify**:
- Adding new endpoints
- Changing validation logic
- Modifying response formats
- Adding authentication/authorization

---

## 🔄 Data Flow

### Startup Flow

```
1. npm run dev
   ↓
2. server.ts: main() function runs
   ↓
3. loadConfig() - Read .env and set defaults
   ↓
4. new ComponentRegistry(dbPath) - Initialize database
   ↓
5. initializeDatabase() - Create tables if not exist
   ↓
6. new ComponentExtractor(paths) - Create parser
   ↓
7. extractor.loadComponents() - Read components.json
   ↓
8. parseComponents() - Loop through 90 categories
   ↓
9. parseComponent() - Extract 334 components
   ↓
10. registry.registerComponent() - Insert into database
    ↓
11. Create search_text field (name + display_name + description + category)
    ↓
12. new MCPTools(registry, extractor, config) - Create API handlers
    ↓
13. app.get/post(...) - Register 11 endpoints
    ↓
14. app.listen(3000) - Start HTTP server
    ↓
15. ✅ Server ready - Waiting for requests
```

### Request Flow (Example: Search for "openai")

```
1. Client sends: POST /mcp/search_components
   Body: { "query": "openai" }
   ↓
2. Express router matches route
   app.post('/mcp/search_components', ...)
   ↓
3. Calls: mcpTools.searchComponents(req, res)
   ↓
4. tools.ts: Extract query from req.body
   const query = { query: "openai" }
   ↓
5. Calls: this.registry.searchComponents(query)
   ↓
6. registry.ts: Build SQL query
   sql = "SELECT * FROM components WHERE search_text LIKE ?"
   params = ["%openai%"]
   ↓
7. Execute SQL query in SQLite
   db.prepare(sql).all(...params)
   ↓
8. Database returns matching rows
   [
     { name: "OpenAIModel", search_text: "openaimodel openai...", ... },
     { name: "OpenAIEmbeddings", search_text: "openaiembeddings...", ... },
     ...
   ]
   ↓
9. registry.ts: Convert rows to components
   rows.map(row => this.rowToComponent(row))
   ↓
10. Parse JSON strings back to objects
    parameters: JSON.parse(row.parameters_schema)
    ↓
11. Return array of LangflowComponent objects
    ↓
12. tools.ts: Wrap in response format
    res.json({ success: true, data: components })
    ↓
13. Express sends JSON response to client
    HTTP 200 OK
    Content-Type: application/json
    ↓
14. ✅ Client receives results
```

---

## 🌐 API Endpoints

### 1. Health Check

```
GET /health
```

**Purpose**: Check if server is running.

**Response**:
```json
{
  "status": "ok",
  "message": "Langflow MCP Server is running"
}
```

---

### 2. List All Components

```
GET /mcp/list_components
```

**Purpose**: Get all 334 components.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "name": "OpenAIModel",
      "display_name": "OpenAI",
      "description": "Interact with OpenAI models",
      "category": "openai",
      "parameters": [
        {
          "name": "api_key",
          "display_name": "API Key",
          "type": "string",
          "required": true,
          "password": true
        },
        {
          "name": "model_name",
          "display_name": "Model Name",
          "type": "string",
          "required": false,
          "default": "gpt-4"
        }
      ],
      "input_types": ["Message"],
      "output_types": ["Message"],
      "tool_mode": false,
      "legacy": false
    },
    // ... 333 more components
  ]
}
```

**Use Case**: Browse all available components.

---

### 3. Search Components

```
POST /mcp/search_components
Content-Type: application/json
```

**Request Body**:
```json
{
  "query": "openai",           // Text search (optional)
  "category": "models",        // Category filter (optional)
  "tool_mode": true,           // Only tool-capable (optional)
  "legacy": false,             // Exclude legacy (optional)
  "limit": 10                  // Max results (optional)
}
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "name": "OpenAIModel",
      "display_name": "OpenAI",
      "category": "openai",
      // ... full component details
    },
    {
      "name": "OpenAIEmbeddings",
      "display_name": "OpenAI Embeddings",
      "category": "openai",
      // ... full component details
    }
  ]
}
```

**Use Cases**:
- Find components by keyword: `{"query": "vector"}`
- Get components in category: `{"category": "embeddings"}`
- Find tool-capable components: `{"tool_mode": true}`
- Combined: `{"query": "openai", "category": "models", "limit": 5}`

---

### 4. Get Component Essentials

```
GET /mcp/component/:name/essentials
```

**Example**: `GET /mcp/component/OpenAIModel/essentials`

**Response**:
```json
{
  "success": true,
  "data": {
    "name": "OpenAIModel",
    "display_name": "OpenAI",
    "description": "Interact with OpenAI large language models",
    "category": "openai",
    "parameters": [
      {
        "name": "api_key",
        "display_name": "API Key",
        "type": "string",
        "required": true,
        "password": true,
        "description": "Your OpenAI API key"
      },
      {
        "name": "model_name",
        "display_name": "Model Name",
        "type": "string",
        "required": false,
        "default": "gpt-4",
        "options": ["gpt-3.5-turbo", "gpt-4", "gpt-4-turbo"]
      },
      {
        "name": "temperature",
        "display_name": "Temperature",
        "type": "number",
        "required": false,
        "default": 0.7,
        "description": "Controls randomness (0-1)"
      }
    ],
    "input_types": ["Message", "Text"],
    "output_types": ["Message"],
    "tool_mode": false,
    "legacy": false,
    "beta": false
  }
}
```

**Use Case**: Get detailed information about a specific component.

---

### 5. Get Component Documentation

```
GET /mcp/component/:name/documentation
```

**Example**: `GET /mcp/component/OpenAIModel/documentation`

**Response**:
```json
{
  "success": true,
  "data": {
    "documentation": "# OpenAI Model\n\n## Description\n\nInteract with OpenAI's large language models...\n\n## Parameters\n\n### API Key\nRequired. Your OpenAI API key from platform.openai.com...\n\n## Examples\n\n```python\n..."
  }
}
```

**Use Case**: Get detailed documentation for a component (if available in `data/docs/`).

---

### 6. Validate Component Configuration

```
POST /mcp/validate_component_config
Content-Type: application/json
```

**Request Body**:
```json
{
  "component_name": "OpenAIModel",
  "config": {
    "api_key": "sk-test123",
    "model_name": "gpt-4",
    "temperature": 0.7
  }
}
```

**Response (Valid)**:
```json
{
  "success": true,
  "data": {
    "valid": true
  }
}
```

**Response (Invalid - Missing Required)**:
```json
{
  "success": false,
  "error": "Missing required parameters",
  "data": {
    "missing_parameters": ["api_key"]
  }
}
```

**Use Case**: Validate that a component configuration has all required parameters.

---

### 7. Create Flow

```
POST /mcp/create_flow
Content-Type: application/json
```

**Request Body**:
```json
{
  "name": "Simple RAG Chat",
  "description": "A RAG chatbot with OpenAI",
  "nodes": [
    {
      "id": "chat-input-1",
      "type": "ChatInput",
      "position": { "x": 100, "y": 100 },
      "data": {
        "type": "ChatInput",
        "node": {
          "template": {}
        }
      }
    },
    {
      "id": "openai-1",
      "type": "OpenAIModel",
      "position": { "x": 300, "y": 100 },
      "data": {
        "type": "OpenAIModel",
        "node": {
          "template": {
            "api_key": { "value": "sk-..." },
            "model_name": { "value": "gpt-4" }
          }
        }
      }
    },
    {
      "id": "chat-output-1",
      "type": "ChatOutput",
      "position": { "x": 500, "y": 100 },
      "data": {
        "type": "ChatOutput",
        "node": {
          "template": {}
        }
      }
    }
  ],
  "edges": [
    {
      "source": "chat-input-1",
      "target": "openai-1",
      "sourceHandle": "output",
      "targetHandle": "input"
    },
    {
      "source": "openai-1",
      "target": "chat-output-1",
      "sourceHandle": "output",
      "targetHandle": "input"
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "name": "Simple RAG Chat",
    "description": "A RAG chatbot with OpenAI",
    "data": {
      "nodes": [...],
      "edges": [...]
    }
  },
  "message": "Flow created successfully"
}
```

**Use Case**: Create a complete workflow programmatically.

---

### 8. Update Flow with Diff Operations

```
POST /mcp/update_flow_partial
Content-Type: application/json
```

**Request Body**:
```json
{
  "flow": {
    "name": "My Flow",
    "data": {
      "nodes": [...],
      "edges": [...]
    }
  },
  "operations": [
    {
      "operation": "addNode",
      "node": {
        "id": "new-node-1",
        "type": "AstraDB",
        "position": { "x": 400, "y": 200 },
        "data": {
          "type": "AstraDB",
          "node": {
            "template": {
              "token": { "value": "..." }
            }
          }
        }
      }
    },
    {
      "operation": "addConnection",
      "edge": {
        "source": "openai-1",
        "target": "new-node-1"
      }
    },
    {
      "operation": "updateNode",
      "nodeId": "openai-1",
      "updates": {
        "data": {
          "node": {
            "template": {
              "temperature": { "value": 0.5 }
            }
          }
        }
      }
    }
  ]
}
```

**Available Operations**:
- `addNode` - Add a new node
- `removeNode` - Remove a node (also removes connected edges)
- `updateNode` - Modify node properties
- `addConnection` - Add an edge between nodes
- `removeConnection` - Remove an edge
- `updateFlowMetadata` - Update flow name, description, etc.

**Response**:
```json
{
  "success": true,
  "data": {
    "name": "My Flow",
    "data": {
      "nodes": [
        // ... original nodes + new node
      ],
      "edges": [
        // ... original edges + new edge
      ]
    }
  },
  "message": "Applied 3 operations successfully"
}
```

**Use Case**: Modify existing flows incrementally (add/remove/update nodes and connections).

---

### 9. List Flow Templates

```
GET /mcp/list_flow_templates
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "name": "Vector Store RAG",
      "description": "Load your data for chat context with Retrieval Augmented Generation.",
      "file": "Vector Store RAG.json"
    },
    {
      "name": "Basic Chat",
      "description": "Simple chat interface with OpenAI",
      "file": "Basic Chat.json"
    }
  ]
}
```

**Use Case**: Discover available pre-built flow templates.

---

### 10. Get Flow Template

```
GET /mcp/flow_template/:name
```

**Example**: `GET /mcp/flow_template/Vector%20Store%20RAG`

**Response**:
```json
{
  "success": true,
  "data": {
    "name": "Vector Store RAG",
    "description": "Load your data for chat context with Retrieval Augmented Generation.",
    "data": {
      "nodes": [
        {
          "id": "file-1",
          "type": "File",
          "position": { "x": 100, "y": 100 },
          "data": {...}
        },
        {
          "id": "astradb-1",
          "type": "AstraDB",
          "position": { "x": 300, "y": 100 },
          "data": {...}
        },
        // ... more nodes
      ],
      "edges": [
        {
          "source": "file-1",
          "target": "astradb-1"
        },
        // ... more edges
      ]
    }
  }
}
```

**Use Case**: Get a complete pre-built flow template to use as starting point.

---

### 11. Get All Categories

```
GET /mcp/categories
```

**Response**:
```json
{
  "success": true,
  "data": [
    "Notion",
    "agentql",
    "agents",
    "aiml",
    "amazon",
    "anthropic",
    "apify",
    "arxiv",
    "assemblyai",
    "azure",
    "baidu",
    "bing",
    "cleanlab",
    "cloudflare",
    "cohere",
    "composio",
    "confluence",
    "crewai",
    "custom_component",
    "data",
    "embeddings",
    "google",
    "groq",
    "huggingface",
    "inputs",
    "langchain",
    "langgraph",
    "logic",
    "memories",
    "models",
    "nvidia",
    "ollama",
    "openai",
    "outputs",
    // ... 90 total categories
  ]
}
```

**Use Case**: Browse available categories for filtering.

---

## 🗄️ Database Schema

### Components Table

```sql
CREATE TABLE components (
  -- Primary Key
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Basic Info
  name TEXT NOT NULL UNIQUE,           -- "OpenAIModel"
  display_name TEXT,                   -- "OpenAI"
  description TEXT,                    -- "Interact with..."
  category TEXT,                       -- "openai"
  subcategory TEXT,                    -- "chat_models"
  
  -- Serialized JSON (stored as TEXT)
  template_schema TEXT,                -- Full template JSON
  parameters_schema TEXT,              -- Parameters array JSON
  base_classes TEXT,                   -- ["BaseLanguageModel", ...]
  input_types TEXT,                    -- ["Message", "Text"]
  output_types TEXT,                   -- ["Message"]
  field_order TEXT,                    -- ["api_key", "model_name", ...]
  
  -- Boolean Flags (stored as INTEGER: 0 or 1)
  tool_mode BOOLEAN DEFAULT 0,         -- Can be used as tool
  legacy BOOLEAN DEFAULT 0,            -- Legacy component
  beta BOOLEAN DEFAULT 0,              -- Beta/experimental
  frozen BOOLEAN DEFAULT 0,            -- Cannot be modified
  
  -- Documentation
  documentation_link TEXT,             -- URL to docs
  documentation_content TEXT,          -- Full docs (MDX)
  
  -- UI
  icon TEXT,                           -- Icon name/path
  
  -- Search (combined searchable text)
  search_text TEXT,                    -- Lowercase: name + display + desc + category
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes

```sql
-- Speed up category filtering
CREATE INDEX idx_components_category ON components(category);

-- Speed up name lookups
CREATE INDEX idx_components_name ON components(name);

-- Speed up tool_mode filtering
CREATE INDEX idx_components_tool_mode ON components(tool_mode);

-- Speed up legacy filtering
CREATE INDEX idx_components_legacy ON components(legacy);

-- Speed up text search
CREATE INDEX idx_components_search ON components(search_text);
```

### Why JSON Serialization?

Some fields (like `parameters`, `input_types`, etc.) are stored as JSON strings because:

1. **SQLite limitations** - No native array/object types
2. **Flexibility** - Schema can evolve without database migrations
3. **Simplicity** - No need for separate parameter tables
4. **Performance** - Parsing JSON is fast for 334 components

**Conversion Example**:

```typescript
// Storing
parameters_schema: JSON.stringify([
  { name: "api_key", type: "string", required: true },
  { name: "model_name", type: "string", default: "gpt-4" }
])

// Retrieving
parameters: JSON.parse(row.parameters_schema || '[]')
```

---

## 🔍 Search Implementation

### How Search Works

The search uses a **combined text field** approach:

#### Step 1: Create Searchable Text (on insert)

```typescript
// registry.ts - registerComponent()
const searchText = `${component.name} ${component.display_name} ${component.description} ${component.category}`.toLowerCase();

// Example result:
// "openaimodel openai interact with openai large language models openai"
```

#### Step 2: Store in Database

```sql
INSERT INTO components (..., search_text) 
VALUES (..., 'openaimodel openai interact with openai large language models openai');
```

#### Step 3: Search with SQL LIKE

```typescript
// registry.ts - searchComponents()
if (query.query) {
  sql += ' AND search_text LIKE ?';
  params.push(`%${query.query.toLowerCase()}%`);
}

// Builds SQL:
// SELECT * FROM components WHERE search_text LIKE '%openai%'
```

#### Step 4: Pattern Matching

```
search_text: "openaimodel openai interact with openai large language models openai"
pattern: "%openai%"

Match! Because "openai" appears multiple times in search_text.
```

### Search Examples

**Example 1: Simple keyword search**

```typescript
// Search for "openai"
const results = registry.searchComponents({ query: "openai" });

// Matches:
// - OpenAIModel (contains "openai" in name and category)
// - OpenAIEmbeddings (contains "openai" in name and category)
// - AzureOpenAI (contains "openai" in name)
```

**Example 2: Category filter**

```typescript
// Get all components in "models" category
const results = registry.searchComponents({ category: "models" });

// SQL: SELECT * FROM components WHERE category = 'models'
```

**Example 3: Combined search**

```typescript
// Find OpenAI components in models category, limit 5
const results = registry.searchComponents({
  query: "openai",
  category: "models",
  limit: 5
});

// SQL:
// SELECT * FROM components 
// WHERE search_text LIKE '%openai%' 
//   AND category = 'models'
// LIMIT 5
```

**Example 4: Filter by flags**

```typescript
// Find tool-capable, non-legacy components
const results = registry.searchComponents({
  tool_mode: true,
  legacy: false
});

// SQL:
// SELECT * FROM components 
// WHERE tool_mode = 1 
//   AND legacy = 0
```

### Search Performance

| Operation | Time Complexity | Notes |
|-----------|-----------------|-------|
| Full scan | O(n) | Checking all 334 components |
| Index lookup | O(log n) | Using category/name indexes |
| LIKE search | O(n) | Linear scan of search_text |
| Combined | O(n) | Limited by LIKE operation |

**Optimization Options** (future):

1. **Full-Text Search (FTS5)**:
   - SQLite's built-in full-text search
   - Much faster for text queries
   - Supports ranking and highlighting

2. **Caching**:
   - Cache popular searches in memory
   - Reduce database hits

3. **Pre-computed Results**:
   - Store common searches (e.g., "openai", "vector")
   - Update on data change

---

## 🔧 Component Extraction Process

### Input: components.json Structure

```json
{
  "category_name": {
    "ComponentName": {
      "display_name": "Human Readable Name",
      "description": "What this component does",
      "template": {
        "parameter_name": {
          "type": "str",              // Langflow type
          "required": true,
          "password": false,
          "display_name": "Parameter Label",
          "info": "Help text",
          "value": "default_value",
          "options": ["option1", "option2"]
        }
      },
      "output_types": ["Message"],
      "input_types": ["Message", "Text"],
      "tool_mode": false,
      "legacy": false,
      "beta": false
    }
  }
}
```

### Extraction Flow

```
components.json (90 categories, 334 components)
   ↓
ComponentExtractor.loadComponents()
   ↓
Read file and parse JSON
   ↓
parseComponents(componentsData)
   ↓
Loop through each category:
   for (const [category, categoryData] of Object.entries(componentsData))
   ↓
   Loop through each component in category:
      for (const [name, comp] of Object.entries(categoryData))
      ↓
      parseComponent(comp, name, category)
         ↓
         Extract basic fields:
         - name: "OpenAIModel"
         - display_name: "OpenAI"
         - description: "Interact with..."
         - category: "openai"
         ↓
         extractParameters(comp.template)
            ↓
            Loop through template fields:
               for (const [key, value] of Object.entries(template))
               ↓
               Create ComponentParameter:
               - name: key
               - display_name: field.display_name
               - type: mapLangflowType(field.type)  // "str" → "string"
               - required: field.required
               - default: field.value
               - options: field.options
               - password: field.password
               ↓
            Return parameters array
         ↓
         extractInputTypes(comp.template)
            ↓
            Collect unique input_types from all parameters
            ↓
            Return input types array
         ↓
         Return LangflowComponent object
      ↓
   Add to components array
   ↓
Return all components (334 total)
```

### Type Mapping

Langflow uses Python-style types, we convert to JavaScript/JSON types:

```typescript
const typeMap: Record<string, string> = {
  'str': 'string',
  'int': 'number',
  'float': 'number',
  'bool': 'boolean',
  'dict': 'object',
  'list': 'array',
  'Message': 'Message',
  'BaseLanguageModel': 'BaseLanguageModel',
  'PromptValue': 'PromptValue',
  'ChatPromptTemplate': 'ChatPromptTemplate'
  // ... more mappings
};
```

### Example Transformation

**Input** (from components.json):

```json
{
  "openai": {
    "OpenAIModel": {
      "display_name": "OpenAI",
      "description": "Interact with OpenAI large language models",
      "template": {
        "api_key": {
          "type": "str",
          "required": true,
          "password": true,
          "display_name": "API Key",
          "info": "Your OpenAI API key"
        },
        "model_name": {
          "type": "str",
          "required": false,
          "value": "gpt-4",
          "options": ["gpt-3.5-turbo", "gpt-4"],
          "display_name": "Model Name"
        },
        "temperature": {
          "type": "float",
          "required": false,
          "value": 0.7,
          "display_name": "Temperature",
          "info": "Controls randomness (0-1)"
        }
      },
      "output_types": ["Message"],
      "tool_mode": false,
      "legacy": false
    }
  }
}
```

**Output** (LangflowComponent):

```typescript
{
  name: "OpenAIModel",
  display_name: "OpenAI",
  description: "Interact with OpenAI large language models",
  category: "openai",
  subcategory: undefined,
  parameters: [
    {
      name: "api_key",
      display_name: "API Key",
      type: "string",
      required: true,
      password: true,
      description: "Your OpenAI API key",
      default: undefined,
      options: undefined
    },
    {
      name: "model_name",
      display_name: "Model Name",
      type: "string",
      required: false,
      password: false,
      description: undefined,
      default: "gpt-4",
      options: ["gpt-3.5-turbo", "gpt-4"]
    },
    {
      name: "temperature",
      display_name: "Temperature",
      type: "number",
      required: false,
      password: false,
      description: "Controls randomness (0-1)",
      default: 0.7,
      options: undefined
    }
  ],
  input_types: [],
  output_types: ["Message"],
  tool_mode: false,
  legacy: false,
  beta: false,
  documentation_link: undefined,
  icon: undefined,
  base_classes: [],
  frozen: false,
  field_order: []
}
```

---

## 🏗️ Flow Building

### What is a Flow?

A **flow** is a visual workflow in Langflow consisting of:

1. **Nodes** - Component instances (e.g., OpenAI, Chat Input, Vector Store)
2. **Edges** - Connections between nodes (data flow)
3. **Metadata** - Name, description, tags

### Flow Structure

```typescript
interface LangflowFlow {
  name: string;              // "My RAG Chatbot"
  description?: string;      // "A chatbot with RAG capabilities"
  data: {
    nodes: FlowNode[];       // Component instances
    edges: FlowEdge[];       // Connections
  };
  tags?: string[];           // ["rag", "openai"]
  metadata?: Record<string, any>;  // Custom data
}

interface FlowNode {
  id: string;                // Unique: "node-1"
  type: string;              // Component name: "OpenAIModel"
  position: {
    x: number;               // X coordinate: 100
    y: number;               // Y coordinate: 200
  };
  data: {
    type: string;            // Component name (again)
    node: {
      template: Record<string, any>;  // Parameter values
    };
  };
}

interface FlowEdge {
  source: string;            // Source node ID: "node-1"
  target: string;            // Target node ID: "node-2"
  sourceHandle?: string;     // Output port: "output"
  targetHandle?: string;     // Input port: "input"
}
```

### Creating a Flow

**Example: Simple Chat Flow**

```typescript
// 1. Define nodes
const nodes = [
  {
    id: "chat-input-1",
    type: "ChatInput",
    position: { x: 100, y: 100 },
    data: {
      type: "ChatInput",
      node: { template: {} }
    }
  },
  {
    id: "openai-1",
    type: "OpenAIModel",
    position: { x: 300, y: 100 },
    data: {
      type: "OpenAIModel",
      node: {
        template: {
          api_key: { value: "sk-..." },
          model_name: { value: "gpt-4" },
          temperature: { value: 0.7 }
        }
      }
    }
  },
  {
    id: "chat-output-1",
    type: "ChatOutput",
    position: { x: 500, y: 100 },
    data: {
      type: "ChatOutput",
      node: { template: {} }
    }
  }
];

// 2. Define connections
const edges = [
  {
    source: "chat-input-1",
    target: "openai-1",
    sourceHandle: "output",
    targetHandle: "input"
  },
  {
    source: "openai-1",
    target: "chat-output-1",
    sourceHandle: "output",
    targetHandle: "input"
  }
];

// 3. Create flow
const flow = {
  name: "Simple Chat",
  description: "Basic chat with OpenAI",
  data: { nodes, edges }
};

// 4. Send to server
POST /mcp/create_flow
Body: flow
```

**Visual Representation**:

```
┌─────────────┐         ┌──────────────┐        ┌──────────────┐
│  ChatInput  │────────>│  OpenAIModel │───────>│  ChatOutput  │
└─────────────┘         └──────────────┘        └──────────────┘
   (node-1)                 (node-2)                (node-3)
```

### Updating a Flow (Diff Operations)

Instead of sending the entire flow, you can apply incremental changes:

**Available Operations**:

1. **addNode** - Add a new component
2. **removeNode** - Delete a component (and its connections)
3. **updateNode** - Modify component parameters
4. **addConnection** - Connect two components
5. **removeConnection** - Disconnect components
6. **updateFlowMetadata**# Langflow MCP Server - Architecture & Flow Documentation

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Overview](#architecture-overview)
3. [File Structure](#file-structure)
4. [Core Components](#core-components)
5. [Data Flow](#data-flow)
6. [API Endpoints](#api-endpoints)
7. [Database Schema](#database-schema)
8. [Search Implementation](#search-implementation)
9. [Component Extraction Process](#component-extraction-process)
10. [Flow Building](#flow-building)
11. [How to Extend](#how-to-extend)

---

## 📋 Project Overview

### What Is This?

The **Langflow MCP Server** is a REST API that provides programmatic access to Langflow components. It enables AI assistants (like Claude, ChatGPT) to:

- Discover available Langflow components (334 components across 90 categories)
- Search components by keyword or category
- Get detailed component information (parameters, types, documentation)
- Build and modify Langflow workflows programmatically
- Access pre-built flow templates

### Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Web Framework**: Express.js 5.1
- **Database**: SQLite (better-sqlite3)
- **HTTP Client**: Axios
- **Development**: ts-node, TypeScript 5.9

### Key Metrics

- **334 Components** loaded from Langflow
- **90 Categories** (openai, anthropic, models, embeddings, etc.)
- **11 API Endpoints** for component discovery and flow building
- **Full-text search** with filtering capabilities

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT (AI Assistant)                     │
│              HTTP Requests (JSON payloads)                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   EXPRESS SERVER (server.ts)                 │
│  • Routes HTTP requests to handlers                          │
│  • Initializes components on startup                         │
│  • Manages server lifecycle                                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    MCP TOOLS (tools.ts)                      │
│  • Business logic for each endpoint                          │
│  • Request/response handling                                 │
│  • Error handling                                            │
└────────────────────────┬────────────────────────────────────┘
                         │
           ┌─────────────┴─────────────┐
           ▼                           ▼
┌──────────────────────┐    ┌──────────────────────┐
│  COMPONENT REGISTRY  │    │ COMPONENT EXTRACTOR  │
│    (registry.ts)     │    │ (componentExtractor) │
│                      │    │                      │
│ • Database queries   │    │ • JSON parsing       │
│ • CRUD operations    │    │ • Type mapping       │
│ • Search logic       │    │ • Docs loading       │
└──────────┬───────────┘    └──────────┬───────────┘
           │                           │
           ▼                           ▼
┌──────────────────────┐    ┌──────────────────────┐
│  SQLITE DATABASE     │    │   DATA FILES         │
│  (langflow.db)       │    │  • components.json   │
│                      │    │  • templates/*.json  │
│ • components table   │    │  • docs/*.mdx        │
│ • Full-text search   │    │                      │
└──────────────────────┘    └──────────────────────┘
```

### Design Principles

1. **Separation of Concerns**: Each file has a single responsibility
2. **Type Safety**: TypeScript interfaces define all data structures
3. **Modularity**: Easy to add new endpoints or modify existing ones
4. **Performance**: Database indexing for fast searches
5. **Error Handling**: Try-catch blocks with meaningful error messages

---

## 📁 File Structure

```
langflow-mcp/
├── src/
│   ├── server.ts              # Entry point, Express setup, startup logic
│   ├── config.ts              # Configuration loader (.env + defaults)
│   ├── types.ts               # TypeScript interfaces & type definitions
│   ├── componentExtractor.ts # Parses components.json into structured data
│   ├── registry.ts            # Database operations (CRUD + search)
│   └── tools.ts               # API endpoint handlers (business logic)
│
├── data/
│   ├── components.json        # 334 Langflow components (source of truth)
│   ├── langflow.db            # SQLite database (auto-generated)
│   ├── templates/             # Flow templates (JSON files)
│   │   └── Vector Store RAG.json
│   └── docs/                  # Component documentation (MDX files)
│
├── package.json               # Dependencies & scripts
├── tsconfig.json              # TypeScript configuration
├── .env.example               # Environment variable template
└── README.md                  # Project documentation
```

---

## 🔧 Core Components

### 1. **server.ts** - The Orchestrator

**Purpose**: Entry point that initializes and coordinates all components.

**Key Functions**:

```typescript
async function main() {
  // 1. Load configuration
  const config = loadConfig();
  
  // 2. Initialize database
  const registry = new ComponentRegistry(config.databasePath);
  
  // 3. Parse Langflow components
  const extractor = new ComponentExtractor(
    config.componentsJsonPath,
    config.docsPath
  );
  const components = extractor.loadComponents();
  
  // 4. Store components in database
  for (const component of components) {
    await registry.registerComponent(component);
  }
  
  // 5. Setup API endpoints
  const mcpTools = new MCPTools(registry, extractor, config);
  
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/mcp/list_components', (req, res) => 
    mcpTools.listComponents(req, res)
  );
  // ... 9 more endpoints
  
  // 6. Start server
  app.listen(config.port);
}
```

**Flow**:
1. Reads configuration from `.env` or uses defaults
2. Creates SQLite database (if doesn't exist)
3. Loads and parses `components.json` (334 components)
4. Stores components in database with search text
5. Registers Express routes
6. Starts HTTP server on port 3000

**When to modify**: Adding new startup tasks, changing server configuration, adding middleware.

---

### 2. **config.ts** - Configuration Manager

**Purpose**: Centralized configuration loading with environment variable support.

**Structure**:

```typescript
export interface Config {
  port: number;                    // Server port (default: 3000)
  componentsJsonPath: string;      // Path to components.json
  flowTemplatesPath: string;       // Path to templates/
  docsPath: string;                // Path to docs/
  databasePath: string;            // Path to langflow.db
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT || '3000'),
    componentsJsonPath: process.env.COMPONENTS_JSON_PATH || 
      path.join(__dirname, '..', 'data', 'components.json'),
    // ... other paths
  };
}
```

**Environment Variables** (`.env`):
- `PORT` - Server port
- `COMPONENTS_JSON_PATH` - Custom components.json location
- `FLOW_TEMPLATES_PATH` - Custom templates directory
- `DOCS_PATH` - Custom docs directory
- `DATABASE_PATH` - Custom database location

**When to modify**: Adding new configuration options, changing default paths.

---

### 3. **types.ts** - Type Definitions

**Purpose**: TypeScript interfaces that define the shape of all data structures.

**Key Interfaces**:

```typescript
// A Langflow component (e.g., OpenAIModel, ChatInput)
export interface LangflowComponent {
  name: string;              // "OpenAIModel"
  display_name: string;      // "OpenAI"
  description: string;       // "Interact with OpenAI models"
  category: string;          // "openai"
  subcategory?: string;      // "chat_models"
  parameters: ComponentParameter[];  // Input fields
  input_types?: string[];    // ["Message", "Text"]
  output_types?: string[];   // ["Message"]
  tool_mode?: boolean;       // Can be used as a tool
  legacy?: boolean;          // Legacy component
  beta?: boolean;            // Beta/experimental
  documentation_link?: string;
  icon?: string;
  base_classes?: string[];   // Inheritance info
  frozen?: boolean;          // Cannot be modified
  field_order?: string[];    // UI field ordering
}

// A component parameter (e.g., api_key, model_name)
export interface ComponentParameter {
  name: string;              // "api_key"
  display_name: string;      // "API Key"
  type: string;              // "string" | "number" | "boolean"
  required: boolean;         // true
  default?: any;             // Default value
  description?: string;      // Help text
  options?: string[] | any[]; // Dropdown options
  placeholder?: string;      // UI placeholder
  password?: boolean;        // Mask input (for secrets)
  multiline?: boolean;       // Textarea vs input
  file_types?: string[];     // Accepted file types
  input_types?: string[];    // Accepted input types
  load_from_db?: boolean;    // Load from database
}

// Search query structure
export interface ComponentSearchQuery {
  query?: string;            // Text search
  category?: string;         // Filter by category
  limit?: number;            // Max results
  tool_mode?: boolean;       // Only tool-capable
  legacy?: boolean;          // Include/exclude legacy
}

// Flow structure
export interface LangflowFlow {
  name: string;
  description?: string;
  data: {
    nodes: FlowNode[];       // Component instances
    edges: FlowEdge[];       // Connections
  };
  tags?: string[];
  metadata?: Record<string, any>;
}

// API response format
export interface MCPToolResponse {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}
```

**When to modify**: Adding new fields to components, creating new data structures.

---

### 4. **componentExtractor.ts** - JSON Parser

**Purpose**: Reads and parses Langflow's `components.json` into structured objects.

**Class Structure**:

```typescript
export class ComponentExtractor {
  private componentsJsonPath: string;
  private docsPath: string;

  // Main entry point: Load all components
  public loadComponents(): LangflowComponent[] {
    const componentsData = JSON.parse(
      fs.readFileSync(this.componentsJsonPath, 'utf-8')
    );
    return this.parseComponents(componentsData);
  }

  // Parse all categories and components
  private parseComponents(componentsData: any): LangflowComponent[] {
    const components: LangflowComponent[] = [];
    
    // Loop through categories (openai, anthropic, etc.)
    for (const [category, categoryData] of Object.entries(componentsData)) {
      // Loop through components in category
      for (const [name, comp] of Object.entries(categoryData as any)) {
        components.push(
          this.parseComponent(comp, name, category)
        );
      }
    }
    
    return components;
  }

  // Parse a single component
  private parseComponent(
    comp: any, 
    name: string, 
    category: string
  ): LangflowComponent {
    return {
      name,
      display_name: comp.display_name || name,
      description: comp.description || '',
      category,
      subcategory: comp.subcategory,
      parameters: this.extractParameters(comp.template || {}),
      input_types: this.extractInputTypes(comp.template),
      output_types: comp.output_types || [],
      tool_mode: comp.tool_mode || false,
      legacy: comp.legacy || false,
      beta: comp.beta || false,
      // ... other fields
    };
  }

  // Extract parameters from template
  private extractParameters(template: any): ComponentParameter[] {
    const params: ComponentParameter[] = [];
    
    for (const [key, value] of Object.entries(template)) {
      const field = value as any;
      params.push({
        name: key,
        display_name: field.display_name || key,
        type: this.mapLangflowType(field.type),
        required: field.required || false,
        default: field.value,
        description: field.info || '',
        options: field.options,
        password: field.password || false,
        // ... other fields
      });
    }
    
    return params;
  }

  // Map Langflow types to standard types
  private mapLangflowType(langflowType: string): string {
    const typeMap: Record<string, string> = {
      'str': 'string',
      'int': 'number',
      'float': 'number',
      'bool': 'boolean',
      'dict': 'object',
      'list': 'array',
      // ... more mappings
    };
    return typeMap[langflowType] || 'string';
  }
}
```

**Data Transformation Example**:

Input (`components.json`):
```json
{
  "openai": {
    "OpenAIModel": {
      "display_name": "OpenAI",
      "description": "Interact with OpenAI models",
      "template": {
        "api_key": {
          "type": "str",
          "required": true,
          "password": true,
          "display_name": "API Key"
        },
        "model_name": {
          "type": "str",
          "default": "gpt-4",
          "options": ["gpt-3.5-turbo", "gpt-4"]
        }
      }
    }
  }
}
```

Output (`LangflowComponent`):
```typescript
{
  name: "OpenAIModel",
  display_name: "OpenAI",
  description: "Interact with OpenAI models",
  category: "openai",
  parameters: [
    {
      name: "api_key",
      display_name: "API Key",
      type: "string",
      required: true,
      password: true
    },
    {
      name: "model_name",
      display_name: "Model Name",
      type: "string",
      required: false,
      default: "gpt-4",
      options: ["gpt-3.5-turbo", "gpt-4"]
    }
  ]
}
```

**When to modify**: 
- Langflow changes their JSON structure
- Need to parse new component fields
- Want to add custom component sources

---

### 5. **registry.ts** - Database Manager

**Purpose**: Manages SQLite database operations (CRUD + search).

**Database Schema**:

```sql
CREATE TABLE components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  description TEXT,
  category TEXT,
  subcategory TEXT,
  
  -- JSON serialized data
  template_schema TEXT,
  parameters_schema TEXT,
  base_classes TEXT,
  input_types TEXT,
  output_types TEXT,
  field_order TEXT,
  
  -- Flags
  tool_mode BOOLEAN DEFAULT 0,
  legacy BOOLEAN DEFAULT 0,
  beta BOOLEAN DEFAULT 0,
  frozen BOOLEAN DEFAULT 0,
  
  -- Documentation
  documentation_link TEXT,
  documentation_content TEXT,
  
  -- UI
  icon TEXT,
  
  -- Search (combined text of name, display_name, description, category)
  search_text TEXT,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast queries
CREATE INDEX idx_components_category ON components(category);
CREATE INDEX idx_components_name ON components(name);
CREATE INDEX idx_components_tool_mode ON components(tool_mode);
CREATE INDEX idx_components_legacy ON components(legacy);
CREATE INDEX idx_components_search ON components(search_text);
```

**Key Methods**:

```typescript
export class ComponentRegistry {
  private db: Database.Database;

  constructor(databasePath: string) {
    this.db = new Database(databasePath);
    this.initializeDatabase();  // Create tables if not exist
  }

  // Create database schema
  private initializeDatabase(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS components (...)`);
  }

  // Insert/update a component
  public async registerComponent(
    component: LangflowComponent, 
    docs?: string
  ): Promise<void> {
    // Create searchable text from all fields
    const searchText = `${component.name} ${component.display_name} ${component.description} ${component.category}`.toLowerCase();

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO components (...)
      VALUES (?, ?, ?, ...)
    `);

    stmt.run(
      component.name,
      component.display_name,
      component.description,
      component.category,
      JSON.stringify(component.parameters),
      // ... other fields
      searchText  // ← Used for search
    );
  }

  // Get all components
  public getAllComponents(): LangflowComponent[] {
    const stmt = this.db.prepare(
      'SELECT * FROM components ORDER BY category, name'
    );
    const rows = stmt.all() as any[];
    return rows.map(row => this.rowToComponent(row));
  }

  // Search components
  public searchComponents(
    query: ComponentSearchQuery
  ): LangflowComponent[] {
    let sql = 'SELECT * FROM components WHERE 1=1';
    const params: any[] = [];

    // Filter by category
    if (query.category) {
      sql += ' AND category = ?';
      params.push(query.category);
    }

    // Filter by tool_mode
    if (query.tool_mode !== undefined) {
      sql += ' AND tool_mode = ?';
      params.push(query.tool_mode ? 1 : 0);
    }

    // Text search using LIKE
    if (query.query) {
      sql += ' AND search_text LIKE ?';
      params.push(`%${query.query.toLowerCase()}%`);
    }

    sql += ' ORDER BY category, name';

    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    return rows.map(row => this.rowToComponent(row));
  }

  // Get single component by name
  public getComponent(name: string): LangflowComponent | null {
    const stmt = this.db.prepare(
      'SELECT * FROM components WHERE name = ?'
    );
    const row = stmt.get(name) as any;
    return row ? this.rowToComponent(row) : null;
  }

  // Convert database row to component object
  private rowToComponent(row: any): LangflowComponent {
    return {
      name: row.name,
      display_name: row.display_name,
      description: row.description,
      category: row.category,
      parameters: JSON.parse(row.parameters_schema || '[]'),
      // ... other fields (parse JSON strings back to objects)
    };
  }
}
```

**Search Implementation Details**:

The search uses SQL `LIKE` with wildcards:

```sql
-- When searching for "openai"
SELECT * FROM components 
WHERE search_text LIKE '%openai%'

-- search_text example:
-- "openaimodel openai interact with openai large language models openai"
```

This matches if "openai" appears **anywhere** in:
- Component name
- Display name  
- Description
- Category

**When to modify**:
- Need more complex queries
- Want to add full-text search (FTS5)
- Need to index additional fields
- Want to add caching

---

### 6. **tools.ts** - API Handlers

**Purpose**: Business logic for each API endpoint.

**Class Structure**:

```typescript
export class MCPTools {
  private registry: ComponentRegistry;
  private extractor: ComponentExtractor;
  private config: Config;

  constructor(
    registry: ComponentRegistry,
    extractor: ComponentExtractor,
    config: Config
  ) {
    this.registry = registry;
    this.extractor = extractor;
    this.config = config;
  }

  // 1. List all components
  public async listComponents(req: Request, res: Response): Promise<void> {
    try {
      const components = await this.registry.getAllComponents();
      res.json({ success: true, data: components });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to list components' 
      });
    }
  }

  // 2. Search components
  public async searchComponents(req: Request, res: Response): Promise<void> {
    try {
      const query: ComponentSearchQuery = req.body;
      const components = await this.registry.searchComponents(query);
      res.json({ success: true, data: components });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to search components' 
      });
    }
  }

  // 3. Get component essentials
  public async getComponentEssentials(
    req: Request, 
    res: Response
  ): Promise<void> {
    try {
      const { name } = req.params;
      const component = await this.registry.getComponent(name);
      
      if (!component) {
        return res.status(404).json({ 
          success: false, 
          error: 'Component not found' 
        });
      }
      
      res.json({ success: true, data: component });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get component' 
      });
    }
  }

  // 4. Get component documentation
  public async getComponentDocs(
    req: Request, 
    res: Response
  ): Promise<void> {
    try {
      const { name } = req.params;
      const docs = this.extractor.loadComponentDocs(name);
      
      if (!docs) {
        return res.status(404).json({ 
          success: false, 
          error: 'Documentation not found' 
        });
      }
      
      res.json({ success: true, data: { documentation: docs } });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get documentation' 
      });
    }
  }

  // 5. Validate component configuration
  public async validateComponentConfig(
    req: Request, 
    res: Response
  ): Promise<void> {
    try {
      const { component_name, config } = req.body;
      const component = await this.registry.getComponent(component_name);
      
      if (!component) {
        return res.status(404).json({ 
          success: false, 
          error: 'Component not found' 
        });
      }
      
      // Validate required parameters
      const missing = component.parameters
        .filter(p => p.required && !config[p.name])
        .map(p => p.name);
      
      if (missing.length > 0) {
        return res.json({
          success: false,
          error: 'Missing required parameters',
          data: { missing_parameters: missing }
        });
      }
      
      res.json({ 
        success: true, 
        data: { valid: true } 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to validate config' 
      });
    }
  }

  // 6. Create a new flow
  public async createFlow(req: Request, res: Response): Promise<void> {
    try {
      const { name, description, nodes, edges } = req.body;
      
      // Validate all nodes reference valid components
      for (const node of nodes) {
        const component = await this.registry.getComponent(node.type);
        if (!component) {
          return res.status(400).json({
            success: false,
            error: `Unknown component: ${node.type}`
          });
        }
      }
      
      const flow: LangflowFlow = {
        name,
        description,
        data: { nodes, edges }
      };
      
      res.json({ 
        success: true, 
        data: flow,
        message: 'Flow created successfully' 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to create flow' 
      });
    }
  }

  // 7. Update flow with diff operations
  public async updateFlowPartial(
    req: Request, 
    res: Response
  ): Promise<void> {
    try {
      const { flow, operations } = req.body;
      let updatedFlow = { ...flow };
      
      for (const op of operations) {
        updatedFlow = this.applyOperation(updatedFlow, op);
      }
      
      res.json({ 
        success: true, 
        data: updatedFlow,
        message: `Applied ${operations.length} operations successfully` 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to update flow' 
      });
    }
  }

  // Helper: Apply a single diff operation
  private applyOperation(
    flow: LangflowFlow, 
    op: FlowDiffOperation
  ): LangflowFlow {
    const updatedFlow = { ...flow };
    
    switch (op.operation) {
      case 'addNode':
        if (op.node) {
          updatedFlow.data.nodes.push(op.node);
        }
        break;
        
      case 'removeNode':
        updatedFlow.data.nodes = updatedFlow.data.nodes.filter(
          n => n.id !== op.nodeId
        );
        updatedFlow.data.edges = updatedFlow.data.edges.filter(
          e => e.source !== op.nodeId && e.target !== op.nodeId
        );
        break;
        
      case 'updateNode':
        if (op.nodeId && op.updates) {
          const nodeIndex = updatedFlow.data.nodes.findIndex(
            n => n.id === op.nodeId
          );
          if (nodeIndex !== -1) {
            updatedFlow.data.nodes[nodeIndex] = {
              ...updatedFlow.data.nodes[nodeIndex],
              ...op.updates,
            };
          }
        }
        break;
        
      case 'addConnection':
        if (op.edge) {
          updatedFlow.data.edges.push(op.edge);
        }
        break;
        
      case 'removeConnection':
        if (op.edge) {
          updatedFlow.data.edges = updatedFlow.data.edges.filter(
            e => !(e.source === op.edge!.source && 
                   e.target === op.edge!.target)
          );
        }
        break;
        
      case 'updateFlowMetadata':
        if (op.metadata) {
          updatedFlow.metadata = { 
            ...updatedFlow.metadata, 
            ...op.metadata 
          };
        }
        break;
    }
    
    return updatedFlow;
  }

  // 8. List flow templates
  public async listFlowTemplates(
    req: Request, 
    res: Response
  ): Promise<void> {
    try {
      const templatesPath = this.config.flowTemplatesPath;
      
      if (!fs.existsSync(templatesPath)) {
        return res.json({ success: true, data: [] });
      }
      
      const files = fs.readdirSync(templatesPath)
        .filter(f => f.endsWith('.json'));
      
      const templates = files.map(file => {
        const content = JSON.parse(
          fs.readFileSync(path.join(templatesPath, file), 'utf-8')
        );
        return {
          name: content.name || file.replace('.json', ''),
          description: content.description || '',
          file: file
        };
      });
      
      res.json({ success: true, data: templates });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to list templates' 
      });
    }
  }

  // 9. Get specific flow template
  public async getFlowTemplate(
    req: Request, 
    res: Response
  ): Promise<void> {
    try {
      const { name } = req.params;
      const templatesPath = this.config.flowTemplatesPath;
      const filePath = path.join(templatesPath, `${name}.json`);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ 
          success: false, 
          error: 'Template not found' 
        });
      }
      
      const template = JSON.parse(
        fs.readFileSync(filePath, 'utf-8')
      );
      
      res.json({ success: true, data: template });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get template' 
      });
    }
  }

  // 10. Get all categories
  public async getCategories(req: Request, res: Response): Promise<void> {
    try {
      const categories = await this.registry.getCategories();
      res.json({ success: true, data: categories });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get categories' 
      });
    }
  }
}
```

**When to modify**:
- Adding new endpoints
- Changing validation logic
- Modifying response formats
- Adding authentication/authorization

---

## 🔄 Data Flow

### Startup Flow

```
1. npm run dev
   ↓
2. server.ts: main() function runs
   ↓
3. loadConfig() - Read .env and set defaults
   ↓
4. new ComponentRegistry(dbPath) - Initialize database
   ↓
5. initializeDatabase() - Create tables if not exist
   ↓
6. new ComponentExtractor(paths) - Create parser
   ↓
7. extractor.loadComponents() - Read components.json
   ↓
8. parseComponents() - Loop through 90 categories
   ↓
9. parseComponent() - Extract 334 components
   ↓
10. registry.registerComponent() - Insert into database
    ↓
11. Create search_text field (name + display_name + description + category)
    ↓
12. new MCPTools(registry, extractor, config) - Create API handlers
    ↓
13. app.get/post(...) - Register 11 endpoints
    ↓
14. app.listen(3000) - Start HTTP server
    ↓
15. ✅ Server ready - Waiting for requests
```

### Request Flow (Example: Search for "openai")

```
1. Client sends: POST /mcp/search_components
   Body: { "query": "openai" }
   ↓
2. Express router matches route
   app.post('/mcp/search_components', ...)
   ↓
3. Calls: mcpTools.searchComponents(req, res)
   ↓
4. tools.ts: Extract query from req.body
   const query = { query: "openai" }
   ↓
5. Calls: this.registry.searchComponents(query)
   ↓
6. registry.ts: Build SQL query
   sql = "SELECT * FROM components WHERE search_text LIKE ?"
   params = ["%openai%"]
   ↓
7. Execute SQL query in SQLite
   db.prepare(sql).all(...params)
   ↓
8. Database returns matching rows
   [
     { name: "OpenAIModel", search_text: "openaimodel openai...", ... },
     { name: "OpenAIEmbeddings", search_text: "openaiembeddings...", ... },
     ...
   ]
   ↓
9. registry.ts: Convert rows to components
   rows.map(row => this.rowToComponent(row))
   ↓
10. Parse JSON strings back to objects
    parameters: JSON.parse(row.parameters_schema)
    ↓
11. Return array of LangflowComponent objects
    ↓
12. tools.ts: Wrap in response format
    res.json({ success: true, data: components })
    ↓
13. Express sends JSON response to client
    HTTP 200 OK
    Content-Type: application/json
    ↓
14. ✅ Client receives results
```

---

## 🌐 API Endpoints

### 1. Health Check

```
GET /health
```

**Purpose**: Check if server is running.

**Response**:
```json
{
  "status": "ok",
  "message": "Langflow MCP Server is running"
}
```

---

### 2. List All Components

```
GET /mcp/list_components
```

**Purpose**: Get all 334 components.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "name": "OpenAIModel",
      "display_name": "OpenAI",
      "description": "Interact with OpenAI models",
      "category": "openai",
      "parameters": [
        {
          "name": "api_key",
          "display_name": "API Key",
          "type": "string",
          "required": true,
          "password": true
        },
        {
          "name": "model_name",
          "display_name": "Model Name",
          "type": "string",
          "required": false,
          "default": "gpt-4"
        }
      ],
      "input_types": ["Message"],
      "output_types": ["Message"],
      "tool_mode": false,
      "legacy": false
    },
    // ... 333 more components
  ]
}
```

**Use Case**: Browse all available components.

---

### 3. Search Components

```
POST /mcp/search_components
Content-Type: application/json
```

**Request Body**:
```json
{
  "query": "openai",           // Text search (optional)
  "category": "models",        // Category filter (optional)
  "tool_mode": true,           // Only tool-capable (optional)
  "legacy": false,             // Exclude legacy (optional)
  "limit": 10                  // Max results (optional)
}
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "name": "OpenAIModel",
      "display_name": "OpenAI",
      "category": "openai",
      // ... full component details
    },
    {
      "name": "OpenAIEmbeddings",
      "display_name": "OpenAI Embeddings",
      "category": "openai",
      // ... full component details
    }
  ]
}
```

**Use Cases**:
- Find components by keyword: `{"query": "vector"}`
- Get components in category: `{"category": "embeddings"}`
- Find tool-capable components: `{"tool_mode": true}`
- Combined: `{"query": "openai", "category": "models", "limit": 5}`

---

### 4. Get Component Essentials

```
GET /mcp/component/:name/essentials
```

**Example**: `GET /mcp/component/OpenAIModel/essentials`

**Response**:
```json
{
  "success": true,
  "data": {
    "name": "OpenAIModel",
    "display_name": "OpenAI",
    "description": "Interact with OpenAI large language models",
    "category": "openai",
    "parameters": [
      {
        "name": "api_key",
        "display_name": "API Key",
        "type": "string",
        "required": true,
        "password": true,
        "description": "Your OpenAI API key"
      },
      {
        "name": "model_name",
        "display_name": "Model Name",
        "type": "string",
        "required": false,
        "default": "gpt-4",
        "options": ["gpt-3.5-turbo", "gpt-4", "gpt-4-turbo"]
      },
      {
        "name": "temperature",
        "display_name": "Temperature",
        "type": "number",
        "required": false,
        "default": 0.7,
        "description": "Controls randomness (0-1)"
      }
    ],
    "input_types": ["Message", "Text"],
    "output_types": ["Message"],
    "tool_mode": false,
    "legacy": false,
    "beta": false
  }
}
```

**Use Case**: Get detailed information about a specific component.

---

### 5. Get Component Documentation

```
GET /mcp/component/:name/documentation
```

**Example**: `GET /mcp/component/OpenAIModel/documentation`

**Response**:
```json
{
  "success": true,
  "data": {
    "documentation": "# OpenAI Model\n\n## Description\n\nInteract with OpenAI's large language models...\n\n## Parameters\n\n### API Key\nRequired. Your OpenAI API key from platform.openai.com...\n\n## Examples\n\n```python\n..."
  }
}
```

**Use Case**: Get detailed documentation for a component (if available in `data/docs/`).

---

### 6. Validate Component Configuration

```
POST /mcp/validate_component_config
Content-Type: application/json
```

**Request Body**:
```json
{
  "component_name": "OpenAIModel",
  "config": {
    "api_key": "sk-test123",
    "model_name": "gpt-4",
    "temperature": 0.7
  }
}
```

**Response (Valid)**:
```json
{
  "success": true,
  "data": {
    "valid": true
  }
}
```

**Response (Invalid - Missing Required)**:
```json
{
  "success": false,
  "error": "Missing required parameters",
  "data": {
    "missing_parameters": ["api_key"]
  }
}
```

**Use Case**: Validate that a component configuration has all required parameters.

---

### 7. Create Flow

```
POST /mcp/create_flow
Content-Type: application/json
```

**Request Body**:
```json
{
  "name": "Simple RAG Chat",
  "description": "A RAG chatbot with OpenAI",
  "nodes": [
    {
      "id": "chat-input-1",
      "type": "ChatInput",
      "position": { "x": 100, "y": 100 },
      "data": {
        "type": "ChatInput",
        "node": {
          "template": {}
        }
      }
    },
    {
      "id": "openai-1",
      "type": "OpenAIModel",
      "position": { "x": 300, "y": 100 },
      "data": {
        "type": "OpenAIModel",
        "node": {
          "template": {
            "api_key": { "value": "sk-..." },
            "model_name": { "value": "gpt-4" }
          }
        }
      }
    },
    {
      "id": "chat-output-1",
      "type": "ChatOutput",
      "position": { "x": 500, "y": 100 },
      "data": {
        "type": "ChatOutput",
        "node": {
          "template": {}
        }
      }
    }
  ],
  "edges": [
    {
      "source": "chat-input-1",
      "target": "openai-1",
      "sourceHandle": "output",
      "targetHandle": "input"
    },
    {
      "source": "openai-1",
      "target": "chat-output-1",
      "sourceHandle": "output",
      "targetHandle": "input"
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "name": "Simple RAG Chat",
    "description": "A RAG chatbot with OpenAI",
    "data": {
      "nodes": [...],
      "edges": [...]
    }
  },
  "message": "Flow created successfully"
}
```

**Use Case**: Create a complete workflow programmatically.

---

### 8. Update Flow with Diff Operations

```
POST /mcp/update_flow_partial
Content-Type: application/json
```

**Request Body**:
```json
{
  "flow": {
    "name": "My Flow",
    "data": {
      "nodes": [...],
      "edges": [...]
    }
  },
  "operations": [
    {
      "operation": "addNode",
      "node": {
        "id": "new-node-1",
        "type": "AstraDB",
        "position": { "x": 400, "y": 200 },
        "data": {
          "type": "AstraDB",
          "node": {
            "template": {
              "token": { "value": "..." }
            }
          }
        }
      }
    },
    {
      "operation": "addConnection",
      "edge": {
        "source": "openai-1",
        "target": "new-node-1"
      }
    },
    {
      "operation": "updateNode",
      "nodeId": "openai-1",
      "updates": {
        "data": {
          "node": {
            "template": {
              "temperature": { "value": 0.5 }
            }
          }
        }
      }
    }
  ]
}
```

**Available Operations**:
- `addNode` - Add a new node
- `removeNode` - Remove a node (also removes connected edges)
- `updateNode` - Modify node properties
- `addConnection` - Add an edge between nodes
- `removeConnection` - Remove an edge
- `updateFlowMetadata` - Update flow name, description, etc.

**Response**:
```json
{
  "success": true,
  "data": {
    "name": "My Flow",
    "data": {
      "nodes": [
        // ... original nodes + new node
      ],
      "edges": [
        // ... original edges + new edge
      ]
    }
  },
  "message": "Applied 3 operations successfully"
}
```

**Use Case**: Modify existing flows incrementally (add/remove/update nodes and connections).

---

### 9. List Flow Templates

```
GET /mcp/list_flow_templates
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "name": "Vector Store RAG",
      "description": "Load your data for chat context with Retrieval Augmented Generation.",
      "file": "Vector Store RAG.json"
    },
    {
      "name": "Basic Chat",
      "description": "Simple chat interface with OpenAI",
      "file": "Basic Chat.json"
    }
  ]
}
```

**Use Case**: Discover available pre-built flow templates.

---

### 10. Get Flow Template

```
GET /mcp/flow_template/:name
```

**Example**: `GET /mcp/flow_template/Vector%20Store%20RAG`

**Response**:
```json
{
  "success": true,
  "data": {
    "name": "Vector Store RAG",
    "description": "Load your data for chat context with Retrieval Augmented Generation.",
    "data": {
      "nodes": [
        {
          "id": "file-1",
          "type": "File",
          "position": { "x": 100, "y": 100 },
          "data": {...}
        },
        {
          "id": "astradb-1",
          "type": "AstraDB",
          "position": { "x": 300, "y": 100 },
          "data": {...}
        },
        // ... more nodes
      ],
      "edges": [
        {
          "source": "file-1",
          "target": "astradb-1"
        },
        // ... more edges
      ]
    }
  }
}
```

**Use Case**: Get a complete pre-built flow template to use as starting point.

---

### 11. Get All Categories

```
GET /mcp/categories
```

**Response**:
```json
{
  "success": true,
  "data": [
    "Notion",
    "agentql",
    "agents",
    "aiml",
    "amazon",
    "anthropic",
    "apify",
    "arxiv",
    "assemblyai",
    "azure",
    "baidu",
    "bing",
    "cleanlab",
    "cloudflare",
    "cohere",
    "composio",
    "confluence",
    "crewai",
    "custom_component",
    "data",
    "embeddings",
    "google",
    "groq",
    "huggingface",
    "inputs",
    "langchain",
    "langgraph",
    "logic",
    "memories",
    "models",
    "nvidia",
    "ollama",
    "openai",
    "outputs",
    // ... 90 total categories
  ]
}
```

**Use Case**: Browse available categories for filtering.

---

## 🗄️ Database Schema

### Components Table

```sql
CREATE TABLE components (
  -- Primary Key
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Basic Info
  name TEXT NOT NULL UNIQUE,           -- "OpenAIModel"
  display_name TEXT,                   -- "OpenAI"
  description TEXT,                    -- "Interact with..."
  category TEXT,                       -- "openai"
  subcategory TEXT,                    -- "chat_models"
  
  -- Serialized JSON (stored as TEXT)
  template_schema TEXT,                -- Full template JSON
  parameters_schema TEXT,              -- Parameters array JSON
  base_classes TEXT,                   -- ["BaseLanguageModel", ...]
  input_types TEXT,                    -- ["Message", "Text"]
  output_types TEXT,                   -- ["Message"]
  field_order TEXT,                    -- ["api_key", "model_name", ...]
  
  -- Boolean Flags (stored as INTEGER: 0 or 1)
  tool_mode BOOLEAN DEFAULT 0,         -- Can be used as tool
  legacy BOOLEAN DEFAULT 0,            -- Legacy component
  beta BOOLEAN DEFAULT 0,              -- Beta/experimental
  frozen BOOLEAN DEFAULT 0,            -- Cannot be modified
  
  -- Documentation
  documentation_link TEXT,             -- URL to docs
  documentation_content TEXT,          -- Full docs (MDX)
  
  -- UI
  icon TEXT,                           -- Icon name/path
  
  -- Search (combined searchable text)
  search_text TEXT,                    -- Lowercase: name + display + desc + category
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes

```sql
-- Speed up category filtering
CREATE INDEX idx_components_category ON components(category);

-- Speed up name lookups
CREATE INDEX idx_components_name ON components(name);

-- Speed up tool_mode filtering
CREATE INDEX idx_components_tool_mode ON components(tool_mode);

-- Speed up legacy filtering
CREATE INDEX idx_components_legacy ON components(legacy);

-- Speed up text search
CREATE INDEX idx_components_search ON components(search_text);
```

### Why JSON Serialization?

Some fields (like `parameters`, `input_types`, etc.) are stored as JSON strings because:

1. **SQLite limitations** - No native array/object types
2. **Flexibility** - Schema can evolve without database migrations
3. **Simplicity** - No need for separate parameter tables
4. **Performance** - Parsing JSON is fast for 334 components

**Conversion Example**:

```typescript
// Storing
parameters_schema: JSON.stringify([
  { name: "api_key", type: "string", required: true },
  { name: "model_name", type: "string", default: "gpt-4" }
])

// Retrieving
parameters: JSON.parse(row.parameters_schema || '[]')
```

---

## 🔍 Search Implementation

### How Search Works

The search uses a **combined text field** approach:

#### Step 1: Create Searchable Text (on insert)

```typescript
// registry.ts - registerComponent()
const searchText = `${component.name} ${component.display_name} ${component.description} ${component.category}`.toLowerCase();

// Example result:
// "openaimodel openai interact with openai large language models openai"
```

#### Step 2: Store in Database

```sql
INSERT INTO components (..., search_text) 
VALUES (..., 'openaimodel openai interact with openai large language models openai');
```

#### Step 3: Search with SQL LIKE

```typescript
// registry.ts - searchComponents()
if (query.query) {
  sql += ' AND search_text LIKE ?';
  params.push(`%${query.query.toLowerCase()}%`);
}

// Builds SQL:
// SELECT * FROM components WHERE search_text LIKE '%openai%'
```

#### Step 4: Pattern Matching

```
search_text: "openaimodel openai interact with openai large language models openai"
pattern: "%openai%"

Match! Because "openai" appears multiple times in search_text.
```

### Search Examples

**Example 1: Simple keyword search**

```typescript
// Search for "openai"
const results = registry.searchComponents({ query: "openai" });

// Matches:
// - OpenAIModel (contains "openai" in name and category)
// - OpenAIEmbeddings (contains "openai" in name and category)
// - AzureOpenAI (contains "openai" in name)
```

**Example 2: Category filter**

```typescript
// Get all components in "models" category
const results = registry.searchComponents({ category: "models" });

// SQL: SELECT * FROM components WHERE category = 'models'
```

**Example 3: Combined search**

```typescript
// Find OpenAI components in models category, limit 5
const results = registry.searchComponents({
  query: "openai",
  category: "models",
  limit: 5
});

// SQL:
// SELECT * FROM components 
// WHERE search_text LIKE '%openai%' 
//   AND category = 'models'
// LIMIT 5
```

**Example 4: Filter by flags**

```typescript
// Find tool-capable, non-legacy components
const results = registry.searchComponents({
  tool_mode: true,
  legacy: false
});

// SQL:
// SELECT * FROM components 
// WHERE tool_mode = 1 
//   AND legacy = 0
```

### Search Performance

| Operation | Time Complexity | Notes |
|-----------|-----------------|-------|
| Full scan | O(n) | Checking all 334 components |
| Index lookup | O(log n) | Using category/name indexes |
| LIKE search | O(n) | Linear scan of search_text |
| Combined | O(n) | Limited by LIKE operation |

**Optimization Options** (future):

1. **Full-Text Search (FTS5)**:
   - SQLite's built-in full-text search
   - Much faster for text queries
   - Supports ranking and highlighting

2. **Caching**:
   - Cache popular searches in memory
   - Reduce database hits

3. **Pre-computed Results**:
   - Store common searches (e.g., "openai", "vector")
   - Update on data change

---

## 🔧 Component Extraction Process

### Input: components.json Structure

```json
{
  "category_name": {
    "ComponentName": {
      "display_name": "Human Readable Name",
      "description": "What this component does",
      "template": {
        "parameter_name": {
          "type": "str",              // Langflow type
          "required": true,
          "password": false,
          "display_name": "Parameter Label",
          "info": "Help text",
          "value": "default_value",
          "options": ["option1", "option2"]
        }
      },
      "output_types": ["Message"],
      "input_types": ["Message", "Text"],
      "tool_mode": false,
      "legacy": false,
      "beta": false
    }
  }
}
```

### Extraction Flow

```
components.json (90 categories, 334 components)
   ↓
ComponentExtractor.loadComponents()
   ↓
Read file and parse JSON
   ↓
parseComponents(componentsData)
   ↓
Loop through each category:
   for (const [category, categoryData] of Object.entries(componentsData))
   ↓
   Loop through each component in category:
      for (const [name, comp] of Object.entries(categoryData))
      ↓
      parseComponent(comp, name, category)
         ↓
         Extract basic fields:
         - name: "OpenAIModel"
         - display_name: "OpenAI"
         - description: "Interact with..."
         - category: "openai"
         ↓
         extractParameters(comp.template)
            ↓
            Loop through template fields:
               for (const [key, value] of Object.entries(template))
               ↓
               Create ComponentParameter:
               - name: key
               - display_name: field.display_name
               - type: mapLangflowType(field.type)  // "str" → "string"
               - required: field.required
               - default: field.value
               - options: field.options
               - password: field.password
               ↓
            Return parameters array
         ↓
         extractInputTypes(comp.template)
            ↓
            Collect unique input_types from all parameters
            ↓
            Return input types array
         ↓
         Return LangflowComponent object
      ↓
   Add to components array
   ↓
Return all components (334 total)


### Type Mapping

Langflow uses Python-style types, we convert to JavaScript/JSON types:

```typescript
const typeMap: Record<string, string> = {
  'str': 'string',
  'int': 'number',
  'float': 'number',
  'bool': 'boolean',
  'dict': 'object',
  'list': 'array',
  'Message': 'Message',
  'BaseLanguageModel': 'BaseLanguageModel',
  'PromptValue': 'PromptValue',
  'ChatPromptTemplate': 'ChatPromptTemplate'
  // ... more mappings
};
```

### Example Transformation

**Input** (from components.json):

```json
{
  "openai": {
    "OpenAIModel": {
      "display_name": "OpenAI",
      "description": "Interact with OpenAI large language models",
      "template": {
        "api_key": {
          "type": "str",
          "required": true,
          "password": true,
          "display_name": "API Key",
          "info": "Your OpenAI API key"
        },
        "model_name": {
          "type": "str",
          "required": false,
          "value": "gpt-4",
          "options": ["gpt-3.5-turbo", "gpt-4"],
          "display_name": "Model Name"
        },
        "temperature": {
          "type": "float",
          "required": false,
          "value": 0.7,
          "display_name": "Temperature",
          "info": "Controls randomness (0-1)"
        }
      },
      "output_types": ["Message"],
      "tool_mode": false,
      "legacy": false
    }
  }
}
```

**Output** (LangflowComponent):

```typescript
{
  name: "OpenAIModel",
  display_name: "OpenAI",
  description: "Interact with OpenAI large language models",
  category: "openai",
  subcategory: undefined,
  parameters: [
    {
      name: "api_key",
      display_name: "API Key",
      type: "string",
      required: true,
      password: true,
      description: "Your OpenAI API key",
      default: undefined,
      options: undefined
    },
    {
      name: "model_name",
      display_name: "Model Name",
      type: "string",
      required: false,
      password: false,
      description: undefined,
      default: "gpt-4",
      options: ["gpt-3.5-turbo", "gpt-4"]
    },
    {
      name: "temperature",
      display_name: "Temperature",
      type: "number",
      required: false,
      password: false,
      description: "Controls randomness (0-1)",
      default: 0.7,
      options: undefined
    }
  ],
  input_types: [],
  output_types: ["Message"],
  tool_mode: false,
  legacy: false,
  beta: false,
  documentation_link: undefined,
  icon: undefined,
  base_classes: [],
  frozen: false,
  field_order: []
}
```

---

## 🏗️ Flow Building

### What is a Flow?

A **flow** is a visual workflow in Langflow consisting of:

1. **Nodes** - Component instances (e.g., OpenAI, Chat Input, Vector Store)
2. **Edges** - Connections between nodes (data flow)
3. **Metadata** - Name, description, tags

### Flow Structure

```typescript
interface LangflowFlow {
  name: string;              // "My RAG Chatbot"
  description?: string;      // "A chatbot with RAG capabilities"
  data: {
    nodes: FlowNode[];       // Component instances
    edges: FlowEdge[];       // Connections
  };
  tags?: string[];           // ["rag", "openai"]
  metadata?: Record<string, any>;  // Custom data
}

interface FlowNode {
  id: string;                // Unique: "node-1"
  type: string;              // Component name: "OpenAIModel"
  position: {
    x: number;               // X coordinate: 100
    y: number;               // Y coordinate: 200
  };
  data: {
    type: string;            // Component name (again)
    node: {
      template: Record<string, any>;  // Parameter values
    };
  };
}

interface FlowEdge {
  source: string;            // Source node ID: "node-1"
  target: string;            // Target node ID: "node-2"
  sourceHandle?: string;     // Output port: "output"
  targetHandle?: string;     // Input port: "input"
}
```

### Creating a Flow

**Example: Simple Chat Flow**

```typescript
// 1. Define nodes
const nodes = [
  {
    id: "chat-input-1",
    type: "ChatInput",
    position: { x: 100, y: 100 },
    data: {
      type: "ChatInput",
      node: { template: {} }
    }
  },
  {
    id: "openai-1",
    type: "OpenAIModel",
    position: { x: 300, y: 100 },
    data: {
      type: "OpenAIModel",
      node: {
        template: {
          api_key: { value: "sk-..." },
          model_name: { value: "gpt-4" },
          temperature: { value: 0.7 }
        }
      }
    }
  },
  {
    id: "chat-output-1",
    type: "ChatOutput",
    position: { x: 500, y: 100 },
    data: {
      type: "ChatOutput",
      node: { template: {} }
    }
  }
];

// 2. Define connections
const edges = [
  {
    source: "chat-input-1",
    target: "openai-1",
    sourceHandle: "output",
    targetHandle: "input"
  },
  {
    source: "openai-1",
    target: "chat-output-1",
    sourceHandle: "output",
    targetHandle: "input"
  }
];

// 3. Create flow
const flow = {
  name: "Simple Chat",
  description: "Basic chat with OpenAI",
  data: { nodes, edges }
};

// 4. Send to server
POST /mcp/create_flow
Body: flow
```

**Visual Representation**:

```
┌─────────────┐         ┌──────────────┐        ┌──────────────┐
│  ChatInput  │────────>│  OpenAIModel │───────>│  ChatOutput  │
└─────────────┘         └──────────────┘        └──────────────┘
   (node-1)                 (node-2)                (node-3)
```

### Updating a Flow (Diff Operations)

Instead of sending the entire flow, you can apply incremental changes:

**Example: Add a Vector Store to RAG Flow**

```typescript
const operations = [
  {
    operation: "addNode",
    node: {
      id: "astradb-1",
      type: "AstraDB",
      position: { x: 200, y: 200 },
      data: {
        type: "AstraDB",
        node: {
          template: {
            token: { value: "AstraCS:..." },
            api_endpoint: { value: "https://..." },
            collection_name: { value: "my_docs" }
          }
        }
      }
    }
  },
  {
    operation: "addConnection",
    edge: {
      source: "chat-input-1",
      target: "astradb-1",
      sourceHandle: "output",
      targetHandle: "input"
    }
  },
  {
    operation: "addConnection",
    edge: {
      source: "astradb-1",
      target: "openai-1",
      sourceHandle: "output",
      targetHandle: "context"
    }
  }
];

// Apply operations
POST /mcp/update_flow_partial
Body: { flow: existingFlow, operations }
```

**Result**:

```
                          ┌──────────────┐
                          │   AstraDB    │
                          │ (Vector DB)  │
                          └──────┬───────┘
                                 │
                                 ↓ context
┌─────────────┐         ┌──────────────┐        ┌──────────────┐
│  ChatInput  │────────>│  OpenAIModel │───────>│  ChatOutput  │
└─────────────┘  query  └──────────────┘        └──────────────┘
```

### Flow Operation Details

**1. addNode**

```typescript
{
  operation: "addNode",
  node: {
    id: "unique-id",
    type: "ComponentName",
    position: { x: 100, y: 100 },
    data: {
      type: "ComponentName",
      node: {
        template: {
          param1: { value: "..." },
          param2: { value: "..." }
        }
      }
    }
  }
}
```

**2. removeNode**

```typescript
{
  operation: "removeNode",
  nodeId: "node-to-remove"
}
// Also removes all edges connected to this node
```

**3. updateNode**

```typescript
{
  operation: "updateNode",
  nodeId: "existing-node-id",
  updates: {
    position: { x: 150, y: 150 },  // Move node
    data: {
      node: {
        template: {
          temperature: { value: 0.5 }  // Update parameter
        }
      }
    }
  }
}
```

**4. addConnection**

```typescript
{
  operation: "addConnection",
  edge: {
    source: "source-node-id",
    target: "target-node-id",
    sourceHandle: "output",
    targetHandle: "input"
  }
}
```

**5. removeConnection**

```typescript
{
  operation: "removeConnection",
  edge: {
    source: "source-node-id",
    target: "target-node-id"
  }
}
```

**6. updateFlowMetadata**

```typescript
{
  operation: "updateFlowMetadata",
  metadata: {
    name: "Updated Flow Name",
    description: "Updated description",
    tags: ["rag", "updated"],
    custom_field: "custom_value"
  }
}
```

---

## 🚀 How to Extend

### Adding a New Endpoint

**File:** `src/tools.ts` and `src/server.ts`

**Steps:**

1. **Add method to MCPTools class** (`tools.ts`):

```typescript
// src/tools.ts
export class MCPTools {
  // ... existing methods
  
  // NEW: Get component usage statistics
  public async getComponentStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = {
        total_components: await this.registry.getComponentCount(),
        categories: await this.registry.getCategoryStats(),
        tool_capable: await this.registry.getToolCapableCount(),
        legacy: await this.registry.getLegacyCount()
      };
      
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get stats' 
      });
    }
  }
}
```

2. **Register route in server** (`server.ts`):

```typescript
// src/server.ts
async function main() {
  // ... existing code
  
  // NEW: Add stats endpoint
  app.get('/mcp/stats', (req, res) => 
    mcpTools.getComponentStats(req, res)
  );
  
  // ... rest of code
}
```

3. **Add supporting methods to registry** (`registry.ts`):

```typescript
// src/registry.ts
export class ComponentRegistry {
  // ... existing methods
  
  public getComponentCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM components');
    const result = stmt.get() as { count: number };
    return result.count;
  }
  
  public getCategoryStats(): Array<{ category: string; count: number }> {
    const stmt = this.db.prepare(`
      SELECT category, COUNT(*) as count 
      FROM components 
      GROUP BY category 
      ORDER BY count DESC
    `);
    return stmt.all() as Array<{ category: string; count: number }>;
  }
  
  public getToolCapableCount(): number {
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM components WHERE tool_mode = 1'
    );
    const result = stmt.get() as { count: number };
    return result.count;
  }
  
  public getLegacyCount(): number {
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM components WHERE legacy = 1'
    );
    const result = stmt.get() as { count: number };
    return result.count;
  }
}
```

4. **Test the endpoint**:

```bash
curl http://localhost:3000/mcp/stats
```

**Response**:
```json
{
  "success": true,
  "data": {
    "total_components": 334,
    "categories": [
      { "category": "openai", "count": 12 },
      { "category": "anthropic", "count": 8 },
      ...
    ],
    "tool_capable": 45,
    "legacy": 23
  }
}
```

---

### Adding a New Component Field

**Scenario:** Langflow adds a new field `popularity_score` to components.

**Steps:**

1. **Update TypeScript interface** (`types.ts`):

```typescript
// src/types.ts
export interface LangflowComponent {
  name: string;
  display_name: string;
  // ... existing fields
  popularity_score?: number;  // NEW FIELD
}
```

2. **Update database schema** (`registry.ts`):

```typescript
// src/registry.ts
export class ComponentRegistry {
  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS components (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        -- ... existing fields
        popularity_score INTEGER DEFAULT 0,  -- NEW COLUMN
        -- ... rest of fields
      );
    `);
    
    // Add migration for existing databases
    try {
      this.db.exec(`
        ALTER TABLE components 
        ADD COLUMN popularity_score INTEGER DEFAULT 0;
      `);
    } catch (error) {
      // Column already exists, ignore error
    }
  }
  
  public async registerComponent(
    component: LangflowComponent, 
    docs?: string
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO components (
        name, display_name, ..., popularity_score
      ) VALUES (?, ?, ..., ?)
    `);
    
    stmt.run(
      component.name,
      component.display_name,
      // ... other fields
      component.popularity_score || 0  // NEW FIELD
    );
  }
  
  private rowToComponent(row: any): LangflowComponent {
    return {
      name: row.name,
      display_name: row.display_name,
      // ... existing fields
      popularity_score: row.popularity_score  // NEW FIELD
    };
  }
}
```

3. **Update component extraction** (`componentExtractor.ts`):

```typescript
// src/componentExtractor.ts
export class ComponentExtractor {
  private parseComponent(
    comp: any, 
    name: string, 
    category: string
  ): LangflowComponent {
    return {
      name,
      display_name: comp.display_name || name,
      // ... existing fields
      popularity_score: comp.popularity_score || 0  // NEW FIELD
    };
  }
}
```

4. **Update search to support sorting by popularity**:

```typescript
// src/registry.ts
export interface ComponentSearchQuery {
  query?: string;
  category?: string;
  limit?: number;
  tool_mode?: boolean;
  legacy?: boolean;
  sort_by?: 'name' | 'category' | 'popularity';  // NEW
}

public searchComponents(query: ComponentSearchQuery): LangflowComponent[] {
  let sql = 'SELECT * FROM components WHERE 1=1';
  const params: any[] = [];
  
  // ... existing filters
  
  // NEW: Sort by popularity if requested
  if (query.sort_by === 'popularity') {
    sql += ' ORDER BY popularity_score DESC, name';
  } else if (query.sort_by === 'category') {
    sql += ' ORDER BY category, name';
  } else {
    sql += ' ORDER BY name';
  }
  
  // ... rest of method
}
```

---

### Adding Authentication

**File:** `src/server.ts`

**Steps:**

1. **Install middleware**:

```bash
npm install express-basic-auth
```

2. **Add authentication middleware**:

```typescript
// src/server.ts
import basicAuth from 'express-basic-auth';

async function main() {
  const app = express();
  
  // Add basic authentication
  if (process.env.ENABLE_AUTH === 'true') {
    app.use(basicAuth({
      users: { 
        [process.env.AUTH_USERNAME || 'admin']: 
        process.env.AUTH_PASSWORD || 'password' 
      },
      challenge: true,
      realm: 'Langflow MCP Server'
    }));
  }
  
  // ... rest of server setup
}
```

3. **Update .env.example**:

```bash
# Authentication (optional)
ENABLE_AUTH=false
AUTH_USERNAME=admin
AUTH_PASSWORD=your-secure-password
```

4. **Test**:

```bash
# Without auth (fails)
curl http://localhost:3000/mcp/list_components

# With auth (succeeds)
curl -u admin:password http://localhost:3000/mcp/list_components
```

---

### Adding Rate Limiting

**File:** `src/server.ts`

**Steps:**

1. **Install middleware**:

```bash
npm install express-rate-limit
```

2. **Add rate limiting**:

```typescript
// src/server.ts
import rateLimit from 'express-rate-limit';

async function main() {
  const app = express();
  
  // Rate limiting: 100 requests per 15 minutes
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
      success: false,
      error: 'Too many requests, please try again later.'
    }
  });
  
  // Apply to all routes
  app.use(limiter);
  
  // ... rest of server setup
}
```

---

### Adding Caching

**File:** `src/registry.ts`

**Steps:**

1. **Install caching library**:

```bash
npm install node-cache
```

2. **Add cache to registry**:

```typescript
// src/registry.ts
import NodeCache from 'node-cache';

export class ComponentRegistry {
  private db: Database.Database;
  private cache: NodeCache;  // NEW
  
  constructor(databasePath: string) {
    this.db = new Database(databasePath);
    this.cache = new NodeCache({ 
      stdTTL: 600,  // Cache for 10 minutes
      checkperiod: 120  // Check for expired keys every 2 minutes
    });
    this.initializeDatabase();
  }
  
  public getAllComponents(): LangflowComponent[] {
    // Check cache first
    const cacheKey = 'all_components';
    const cached = this.cache.get<LangflowComponent[]>(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Not in cache, query database
    const stmt = this.db.prepare(
      'SELECT * FROM components ORDER BY category, name'
    );
    const rows = stmt.all() as any[];
    const components = rows.map(row => this.rowToComponent(row));
    
    // Store in cache
    this.cache.set(cacheKey, components);
    
    return components;
  }
  
  public searchComponents(query: ComponentSearchQuery): LangflowComponent[] {
    // Create cache key from query
    const cacheKey = `search_${JSON.stringify(query)}`;
    const cached = this.cache.get<LangflowComponent[]>(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Not in cache, perform search
    let sql = 'SELECT * FROM components WHERE 1=1';
    // ... existing search logic
    
    const components = rows.map(row => this.rowToComponent(row));
    
    // Store in cache
    this.cache.set(cacheKey, components);
    
    return components;
  }
  
  public async registerComponent(
    component: LangflowComponent, 
    docs?: string
  ): Promise<void> {
    // ... existing code
    
    // Clear cache when data changes
    this.cache.flushAll();
  }
}
```

---

### Adding Logging

**File:** `src/server.ts` and `src/tools.ts`

**Steps:**

1. **Install logging library**:

```bash
npm install winston
```

2. **Create logger utility**:

```typescript
// src/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});
```

3. **Use logger in server**:

```typescript
// src/server.ts
import { logger } from './logger';

async function main() {
  try {
    const config = loadConfig();
    logger.info('Configuration loaded', { port: config.port });
    
    const registry = new ComponentRegistry(config.databasePath);
    logger.info('Database initialized');
    
    const extractor = new ComponentExtractor(
      config.componentsJsonPath,
      config.docsPath
    );
    const components = extractor.loadComponents();
    logger.info(`Loaded ${components.length} components`);
    
    // ... rest of startup
    
    app.listen(config.port, () => {
      logger.info(`Server running on http://localhost:${config.port}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}
```

4. **Use logger in API handlers**:

```typescript
// src/tools.ts
import { logger } from './logger';

export class MCPTools {
  public async searchComponents(req: Request, res: Response): Promise<void> {
    try {
      const query: ComponentSearchQuery = req.body;
      logger.info('Search request', { query });
      
      const components = await this.registry.searchComponents(query);
      logger.info('Search completed', { 
        query, 
        results: components.length 
      });
      
      res.json({ success: true, data: components });
    } catch (error) {
      logger.error('Search failed', { error, query: req.body });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to search components' 
      });
    }
  }
}
```

---

### Adding Database Migrations

**File:** `src/migrations.ts` (new file)

**Steps:**

1. **Create migrations system**:

```typescript
// src/migrations.ts
import Database from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
  down: (db: Database.Database) => void;
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS components (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          -- ... full schema
        );
      `);
    },
    down: (db) => {
      db.exec('DROP TABLE IF EXISTS components');
    }
  },
  {
    version: 2,
    name: 'add_popularity_score',
    up: (db) => {
      db.exec(`
        ALTER TABLE components 
        ADD COLUMN popularity_score INTEGER DEFAULT 0;
      `);
    },
    down: (db) => {
      // SQLite doesn't support DROP COLUMN, 
      // would need to recreate table
    }
  }
];

export function runMigrations(db: Database.Database): void {
  // Create migrations table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Get current version
  const stmt = db.prepare(
    'SELECT MAX(version) as version FROM migrations'
  );
  const result = stmt.get() as { version: number | null };
  const currentVersion = result.version || 0;
  
  // Run pending migrations
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      console.log(`Running migration: ${migration.name}`);
      migration.up(db);
      
      db.prepare(
        'INSERT INTO migrations (version, name) VALUES (?, ?)'
      ).run(migration.version, migration.name);
      
      console.log(`Migration ${migration.name} completed`);
    }
  }
}
```

2. **Use in registry**:

```typescript
// src/registry.ts
import { runMigrations } from './migrations';

export class ComponentRegistry {
  constructor(databasePath: string) {
    this.db = new Database(databasePath);
    runMigrations(this.db);  // Run migrations instead of initializeDatabase
  }
}
```

---

## 📝 Best Practices

### 1. Error Handling

Always wrap async operations in try-catch:

```typescript
public async myEndpoint(req: Request, res: Response): Promise<void> {
  try {
    // Your logic here
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Operation failed', { error });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process request' 
    });
  }
}
```

### 2. Input Validation

Validate all user inputs:

```typescript
public async searchComponents(req: Request, res: Response): Promise<void> {
  try {
    const query: ComponentSearchQuery = req.body;
    
    // Validate inputs
    if (query.limit && (query.limit < 1 || query.limit > 100)) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be between 1 and 100'
      });
    }
    
    if (query.category && typeof query.category !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Category must be a string'
      });
    }
    
    // Proceed with search
    const components = await this.registry.searchComponents(query);
    res.json({ success: true, data: components });
  } catch (error) {
    // ... error handling
  }
}
```

### 3. Database Transactions

Use transactions for multiple related operations:

```typescript
public async bulkRegisterComponents(
  components: LangflowComponent[]
): Promise<void> {
  const transaction = this.db.transaction(() => {
    for (const component of components) {
      this.registerComponent(component);
    }
  });
  
  transaction();  // Execute transaction
}
```

### 4. Type Safety

Always define types for your data:

```typescript
// Good
interface MyRequestBody {
  name: string;
  value: number;
}

public async myEndpoint(req: Request, res: Response): Promise<void> {
  const body: MyRequestBody = req.body;
  // TypeScript knows body.name is string, body.value is number
}

// Bad
public async myEndpoint(req: Request, res: Response): Promise<void> {
  const body = req.body;  // Type is 'any'
  // No type safety
}
```

### 5. Documentation

Document complex functions:

```typescript
/**
 * Searches for components matching the given criteria.
 * 
 * @param query - Search parameters
 * @param query.query - Text to search for (searches name, display_name, description)
 * @param query.category - Filter by category (exact match)
 * @param query.tool_mode - Filter by tool capability
 * @param query.legacy - Include/exclude legacy components
 * @param query.limit - Maximum number of results (1-100)
 * @returns Array of matching components
 * 
 * @example
 * const results = registry.searchComponents({
 *   query: "openai",
 *   category: "models",
 *   limit: 10
 * });
 */
public searchComponents(query: ComponentSearchQuery): LangflowComponent[] {
  // ... implementation
}
```

---

## 🎯 Summary

### Key Takeaways

1. **Architecture**: Modular design with clear separation of concerns
   - `server.ts` - Entry point and orchestration
   - `config.ts` - Configuration management
   - `types.ts` - Type definitions
   - `componentExtractor.ts` - JSON parsing
   - `registry.ts` - Database operations
   - `tools.ts` - API business logic

2. **Data Flow**: Simple and predictable
   - Startup: Load → Parse → Store → Serve
   - Request: Receive → Validate → Query → Transform → Respond

3. **Database**: SQLite with efficient indexing
   - JSON serialization for complex fields
   - Combined text search field
   - Prepared statements for safety

4. **API Design**: RESTful and intuitive
   - 11 endpoints for all operations
   - Consistent response format
   - Comprehensive error handling

5. **Extensibility**: Easy to add features
   - New endpoints: Add method + route
   - New fields: Update types + schema + extraction
   - Middleware: Add to Express pipeline
   - Migrations: Version-controlled schema changes

### File Modification Guide

| Task | Files to Modify |
|------|----------------|
| Add new endpoint | `tools.ts`, `server.ts` |
| Add component field | `types.ts`, `registry.ts`, `componentExtractor.ts` |
| Change database schema | `registry.ts`, consider migrations |
| Add validation | `tools.ts` |
| Add authentication | `server.ts` |
| Add logging | Create `logger.ts`, use everywhere |
| Add caching | `registry.ts` |
| Change configuration | `config.ts`, `.env.example` |
| Add new data source | `componentExtractor.ts` |

### Common Operations

**Start server:**
```bash
npm run dev         # Development (with ts-node)
npm run build       # Compile TypeScript
npm start           # Production (compiled)
```

**Query components:**
```bash
# List all
curl http://localhost:3000/mcp/list_components

# Search
curl -X POST http://localhost:3000/mcp/search_components \
  -H "Content-Type: application/json" \
  -d '{"query": "openai", "limit": 5}'

# Get specific component
curl http://localhost:3000/mcp/component/OpenAIModel/essentials
```

**Create flow:**
```bash
curl -X POST http://localhost:3000/mcp/create_flow \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Flow",
    "nodes": [...],
    "edges": [...]
  }'
```

---

## 📚 Additional Resources

### Documentation Files

- `README.md` - API documentation and usage examples
- `MVP_SUMMARY.md` - Implementation overview
- `GETTING_STARTED.md` - Quick start guide
- `QUICK_REFERENCE.md` - Cheat sheet for common tasks
- `FLOW.md` - This comprehensive architecture guide

### External References

- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- [Langflow Documentation](https://docs.langflow.org/)
- [Model Context Protocol](https://modelcontextprotocol.io/)

### Community

- Issues: Report bugs or request features
- Pull Requests: Contribute improvements
- Discussions: Ask questions and share ideas

---

**Last Updated:** November 6, 2025  
**Version:** 1.0.0  
**Maintained by:** Langflow MCP Team