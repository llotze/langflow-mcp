/**
 * Redirect console output to stderr when running in stdio mode.
 * This prevents console logs from interfering with MCP protocol messages.
 */
if (process.env.MCP_MODE === 'stdio') {
  console.log = console.error;
  console.info = console.error;
  console.warn = console.error;
  console.debug = () => {};
}

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from '../core/config.js';
import { LangflowApiService } from '../services/langflowApiService.js';
import { LangflowComponentService } from '../services/LangflowComponentService.js';
import { LangflowFlowBuilder } from '../services/LangflowFlowBuilder.js';
import { MCPTools } from '../tools.js';

/**
 * Starts the Langflow MCP stdio server.
 * 
 * Implements the Model Context Protocol (MCP) over stdio, allowing
 * Claude Desktop and other MCP clients to interact with Langflow.
 * 
 * The server exposes tools for:
 * - Template discovery and instantiation
 * - Flow modification via operations
 * - Component search and inspection
 * - Flow execution and monitoring
 * 
 * Communication uses JSON-RPC 2.0 over stdio for compatibility
 * with MCP client implementations.
 */
async function main() {
  const config = loadConfig();

  // Initialize Langflow API client if credentials are available
  let langflowApi: LangflowApiService | null = null;
  if (config.langflowApiUrl && config.langflowApiKey) {
    langflowApi = new LangflowApiService(
      config.langflowApiUrl,
      config.langflowApiKey
    );
    await langflowApi.testConnection();
  }

  // Create MCP server instance
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

  /**
   * Registers all available MCP tools with their schemas.
   * 
   * Each tool includes:
   * - name: Unique identifier
   * - description: Human-readable explanation with usage examples
   * - inputSchema: JSON Schema defining required/optional parameters
   * 
   * Tool descriptions include examples and warnings to guide Claude's usage.
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'search_templates',
        description: 'Search templates by keyword, metadata, or component usage',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: 'Search term (name, description, tags)' },
            tags: { type: 'string', description: 'Comma-separated tags' },
            category: { type: 'string', description: 'Template category' },
            component: { type: 'string', description: 'Component type to filter by' },
            page: { type: 'number', description: 'Page number' },
            pageSize: { type: 'number', description: 'Results per page' }
          }
        }
      },
      {
        name: 'get_template',
        description: 'Get full or essentials info for a template by templateId',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: { type: 'string', description: 'Template ID' }
          },
          required: ['templateId']
        }
      },
      {
        name: 'tweak_flow',
        description: `Edit an existing Langflow flow by applying operations.

        USAGE EXAMPLE:
        {
          "flowId": "abc-123",
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
        }

        IMPORTANT: Only use "operations" array. Do not use legacy "tweaks" format.`,
        inputSchema: {
          type: 'object',
          properties: {
            flowId: { 
              type: 'string', 
              description: 'UUID of the flow to modify' 
            },
            operations: {
              type: 'array',
              description: 'Operations to apply (updateNode, addEdge, etc.)',
              items: {
                type: 'object',
                properties: {
                  type: { 
                    type: 'string',
                    enum: ['updateNode', 'addNode', 'removeNode', 'addEdge', 'removeEdge', 'updateMetadata']
                  },
                  nodeId: { type: 'string' },
                  updates: { 
                    type: 'object',
                    properties: {
                      template: { 
                        type: 'object',
                        description: 'Parameter values to update (e.g., temperature, max_tokens)'
                      }
                    }
                  },
                  merge: { 
                    type: 'boolean',
                    description: 'Deep merge updates (default: false)'
                  }
                }
              }
            }
          },
          required: ['flowId', 'operations']
        }
      },
      {
        name: 'run_flow',
        description: 'Run an existing flow by flowId',
        inputSchema: {
          type: 'object',
          properties: {
            flowId: { type: 'string', description: 'Flow ID' },
            input: { type: 'object', description: 'Input for flow run' }
          },
          required: ['flowId', 'input']
        }
      },
      {
        name: 'get_flow_details',
        description: 'Get complete flow structure and configuration by flowId (WARNING: returns large payload - use sparingly)',
        inputSchema: {
          type: 'object',
          properties: {
            flowId: { type: 'string', description: 'Flow ID to retrieve' }
          },
          required: ['flowId']
        }
      },
      {
        name: 'search_components',
        description: 'Search for available components by keyword',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: 'Search term' }
          },
          required: ['keyword']
        }
      },
      {
        name: 'get_component_details',
        description: 'Get full template and configuration for a component',
        inputSchema: {
          type: 'object',
          properties: {
            componentName: { type: 'string', description: 'Component name (e.g., "ChatInput")' }
          },
          required: ['componentName']
        }
      },
      {
        name: 'get_component_essentials',
        description: 'Get only the most important properties and examples for a component',
        inputSchema: {
          type: 'object',
          properties: {
            componentName: { type: 'string', description: 'Component name (e.g., "OpenAIModel")' }
          },
          required: ['componentName']
        }
      },
      {
        name: 'search_component_properties',
        description: 'Search for properties in a component by keyword',
        inputSchema: {
          type: 'object',
          properties: {
            componentName: { type: 'string', description: 'Component name (e.g., "OpenAIModel")' },
            query: { type: 'string', description: 'Search term for property name or description' }
          },
          required: ['componentName', 'query']
        }
      },
      {
        name: 'build_and_deploy_flow',
        description: 'Build a flow from component specifications and deploy',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Flow name' },
            description: { type: 'string', description: 'Flow description' },
            nodes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  component: { type: 'string' },
                  id: { type: 'string' },
                  position: { type: 'object' },
                  params: { type: 'object' }
                }
              }
            },
            connections: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  source: { type: 'string' },
                  target: { type: 'string' },
                  targetParam: { type: 'string' }
                }
              }
            }
          },
          required: ['name', 'nodes', 'connections']
        }
      },
      {
        name: 'create_flow_from_template',
        description: 'Create a flow from a template by templateId',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: { type: 'string', description: 'Template ID' },
            name: { type: 'string', description: 'Flow name' },
            description: { type: 'string', description: 'Flow description' }
          },
          required: ['templateId']
        }
      }
    ],
  }));

  /**
   * Handles tool execution requests from MCP clients.
   * 
   * Routes tool calls to appropriate MCPTools methods and formats
   * responses according to MCP protocol specifications.
   * 
   * All responses include:
   * - content: Array of content items (text, resources, etc.)
   * - isError: Boolean indicating if the operation failed
   * 
   * Errors are caught and returned as structured error responses
   * rather than throwing exceptions to maintain protocol compliance.
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Initialize MCPTools with Langflow API credentials
    const mcpTools = langflowApi
      ? new MCPTools(
          undefined,
          undefined,
          config.langflowApiUrl,
          config.langflowApiKey
        )
      : null;

    // Check if Langflow API is configured
    if (!langflowApi) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: 'Langflow API not configured' }, null, 2),
        }],
        isError: true,
      };
    }

    const componentService = new LangflowComponentService(langflowApi);
    const flowBuilder = new LangflowFlowBuilder(componentService, langflowApi);

    try {
      const args = request.params.arguments || {};

      // Route tool call to appropriate handler
      switch (request.params.name) {
        case 'search_templates': {
          if (!mcpTools) throw new Error('Langflow API not configured');
          const req = { query: args };
          let result: any;
          await mcpTools.searchTemplates(req, {
            json: (data: any) => { result = data; },
            status: (code: number) => ({ json: (data: any) => { result = data; } })
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'get_template': {
          if (!mcpTools) throw new Error('Langflow API not configured');
          const req = { params: args };
          let result: any;
          await mcpTools.getTemplate(req, {
            json: (data: any) => { result = data; },
            status: (code: number) => ({ json: (data: any) => { result = data; } })
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'tweak_flow': {
          if (!mcpTools) throw new Error('Langflow API not configured');
          const req = { params: { flowId: args.flowId }, body: args };
          let result: any;
          await mcpTools.tweakFlow(req, {
            json: (data: any) => { result = data; },
            status: (code: number) => ({ json: (data: any) => { result = data; } })
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'run_flow': {
          if (!mcpTools) throw new Error('Langflow API not configured');
          const req = { params: { flowId: args.flowId }, body: args };
          let result: any;
          await mcpTools.runFlow(req, {
            json: (data: any) => { result = data; },
            status: (code: number) => ({ json: (data: any) => { result = data; } })
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'get_flow_details': {
          if (!mcpTools) throw new Error('Langflow API not configured');
          const req = { params: { flowId: args.flowId } };
          let result: any;
          await mcpTools.getFlowDetails(req, {
            json: (data: any) => { result = data; },
            status: (code: number) => ({ json: (data: any) => { result = data; } })
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'search_components': {
          const results = await componentService.searchComponents(args.keyword as string);
          return {
            content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
          };
        }

        case 'get_component_details': {
          const template = await componentService.getComponentTemplate(args.componentName as string);
          return {
            content: [{ type: 'text', text: JSON.stringify(template, null, 2) }]
          };
        }

        case 'get_component_essentials': {
          if (!mcpTools) throw new Error('Langflow API not configured');
          const req = { params: { componentName: args.componentName } };
          let result: any;
          await mcpTools.getComponentEssentials(req, {
            json: (data: any) => { result = data; },
            status: (code: number) => ({ json: (data: any) => { result = data; } })
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'search_component_properties': {
          if (!mcpTools) throw new Error('Langflow API not configured');
          const req = { params: { componentName: args.componentName }, query: { query: args.query } };
          let result: any;
          await mcpTools.searchComponentProperties(req, {
            json: (data: any) => { result = data; },
            status: (code: number) => ({ json: (data: any) => { result = data; } })
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'build_and_deploy_flow': {
          const deployed = await flowBuilder.buildAndDeployFlow(
            args.name as string,
            args.description as string,
            args.nodes as any[],
            args.connections as any[]
          );
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                flow_id: deployed.id,
                url: `${langflowApi.baseUrl}/flow/${deployed.id}`
              }, null, 2)
            }]
          };
        }

        case 'create_flow_from_template': {
          if (!mcpTools) throw new Error('Langflow API not configured');
          const req = { params: { templateId: args.templateId }, body: args };
          let result: any;
          await mcpTools.createFlowFromTemplate(req, {
            json: (data: any) => { result = data; },
            status: (code: number) => ({ json: (data: any) => { result = data; } })
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        default:
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ error: `Unknown tool: ${request.params.name}` }, null, 2),
            }],
            isError: true,
          };
      }
    } catch (error) {
      // Format error response according to MCP protocol
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
            tool: request.params.name,
          }, null, 2),
        }],
        isError: true,
      };
    }
  });

  // Connect server to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});