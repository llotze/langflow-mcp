import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ComponentRegistry } from '../core/registry.js';  
import { ComponentExtractor } from '../core/componentExtractor.js'; 
import { loadConfig } from '../core/config.js'; 
import { ComponentSearchQuery } from '../types.js';  

async function main() {
  // Same setup as REST API
  const config = loadConfig();
  const registry = new ComponentRegistry(config.databasePath);
  const extractor = new ComponentExtractor(
    config.componentsJsonPath,
    config.docsPath
  );

  // IMPORTANT: Suppress all stdout logging from extractor
  // MCP requires ONLY JSON-RPC on stdout
  const originalLog = console.log;
  console.log = console.error; // Redirect logs to stderr

  // Load components (reusing same logic!)
  const components = extractor.loadComponents();
  for (const component of components) {
    await registry.registerComponent(component);
  }

  // Restore console.log (though we shouldn't use it)
  console.log = originalLog;

  // Create MCP server
  const server = new Server(
    {
      name: 'langflow-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tools that Claude can call
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'search_components',
        description: 'Search for Langflow components by keyword, category, or filters',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term to match in component names and descriptions' },
            category: { type: 'string', description: 'Filter by specific category (e.g., "models", "agents")' },
            limit: { type: 'number', description: 'Maximum number of results to return' },
            tool_mode: { type: 'boolean', description: 'Filter components by tool mode capability' },
            legacy: { type: 'boolean', description: 'Include legacy/deprecated components' },
          },
        },
      },
      {
        name: 'get_component',
        description: 'Get detailed information about a specific Langflow component including parameters and configuration',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Exact component name (case-sensitive)' },
          },
          required: ['name'],
        },
      },
      {
        name: 'list_categories',
        description: 'List all available Langflow component categories',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'search_components': {
          const searchQuery: ComponentSearchQuery = {
            query: args?.query as string | undefined,
            category: args?.category as string | undefined,
            limit: args?.limit as number | undefined,
            tool_mode: args?.tool_mode as boolean | undefined,
            legacy: args?.legacy as boolean | undefined,
          };
          
          const results = registry.searchComponents(searchQuery);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case 'get_component': {
          if (!args?.name || typeof args.name !== 'string') {
            throw new Error('Component name is required');
          }
          
          const component = registry.getComponent(args.name as string);
          if (!component) {
            throw new Error(`Component '${args.name}' not found`);
          }
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(component, null, 2),
              },
            ],
          };
        }

        case 'list_categories': {
          const categories = registry.getCategories();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(categories, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (not stdout!)
  console.error('Langflow MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});