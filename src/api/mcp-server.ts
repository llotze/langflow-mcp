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
import { FlowHistory } from '../services/flowHistory.js';

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

  // Initialize services
  let langflowApi: LangflowApiService | null = null;
  const flowHistory = new FlowHistory();  // Create history instance

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

      IMPORTANT: Use "updates" field, NOT "params"!

      EXAMPLE - Update Prompt Template:
      {
        "flowId": "abc-123",
        "operations": [{
          "type": "updateNode",
          "nodeId": "Prompt-xyz",
          "updates": {
            "data": {
              "node": {
                "template": {
                  "template": {
                    "value": "Your new prompt text here"
                  }
                }
              }
            }
          },
          "merge": true
        }]
      }

      For Prompt Template components, the path is:
      updates.data.node.template.template.value

      SUPPORTED OPERATIONS:

      1. Add Single Node:
      {
        "type": "addNode",
        "nodeId": "openai_1",
        "component": "OpenAIModel",
        "params": { "model_name": "gpt-4o-mini" },
        "position": { "x": 400, "y": 200 }
      }

      2. Bulk Add Nodes:
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

      3. Bulk Remove Nodes:
      {
        "type": "removeNodes",
        "nodeIds": ["node1", "node2", "node3"],
        "removeConnections": true
      }

      4. Bulk Add Edges:
      {
        "type": "addEdges",
        "edges": [
          { "source": "input_1", "target": "llm_1", "targetParam": "input_value" },
          { "source": "llm_1", "target": "output_1", "targetParam": "input_value" }
        ]
      }

      5. Bulk Remove Edges:
      {
        "type": "removeEdges",
        "edges": [
          { "source": "node1", "target": "node2" },
          { "source": "node2", "target": "node3" }
        ]
      }

      BENEFITS OF BULK OPERATIONS:
      - 80-90% faster than individual operations
      - Single validation pass
      - Automatic layout positioning
      - Better error handling

      IMPORTANT: Use bulk operations when adding/removing multiple items.`,
        inputSchema: {
          type: 'object',
          properties: {
            flowId: { 
              type: 'string', 
              description: 'UUID of the flow to modify' 
            },
            operations: {
              type: 'array',
              description: 'Array of operations - MUST use "updates" field for updateNode operations',
              items: {
                type: 'object',
                properties: {
                  type: { 
                    type: 'string',
                    enum: [
                      'addNode', 'updateNode', 'removeNode', 'moveNode',
                      'addEdge', 'removeEdge', 'updateMetadata',
                      'addNodes', 'removeNodes', 'addEdges', 'removeEdges'
                    ]
                  },
                  // Single node operations
                  nodeId: { type: 'string' },
                  component: { type: 'string' },
                  params: { type: 'object' },
                  position: { type: 'object' },
                  
                  // Bulk node operations
                  nodes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        nodeId: { type: 'string' },
                        component: { type: 'string' },
                        params: { type: 'object' },
                        position: { type: 'object' }
                      }
                    }
                  },
                  nodeIds: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  autoLayout: {
                    type: 'string',
                    enum: ['horizontal', 'vertical', 'grid']
                  },
                  spacing: { type: 'number' },
                  
                  // Edge operations
                  edges: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        source: { type: 'string' },
                        target: { type: 'string' },
                        targetParam: { type: 'string' }
                      }
                    }
                  },
                  
                  // Other fields
                  updates: { type: 'object' },
                  merge: { type: 'boolean' },
                  source: { type: 'string' },
                  target: { type: 'string' },
                  removeConnections: { type: 'boolean' }
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
      },
      
      // UNDO/REDO TOOLS
      {
        name: 'undo_flow_changes',
        description: 'Undo the last set of operations applied to a flow',
        inputSchema: {
          type: 'object',
          properties: {
            flowId: { 
              type: 'string', 
              description: 'Flow ID to undo changes for' 
            }
          },
          required: ['flowId']
        }
      },
      {
        name: 'redo_flow_changes',
        description: 'Redo the next set of operations for a flow',
        inputSchema: {
          type: 'object',
          properties: {
            flowId: { 
              type: 'string', 
              description: 'Flow ID to redo changes for' 
            }
          },
          required: ['flowId']
        }
      },
      {
        name: 'get_flow_history',
        description: 'Get history information for a flow (shows what can be undone/redone)',
        inputSchema: {
          type: 'object',
          properties: {
            flowId: { 
              type: 'string', 
              description: 'Flow ID to get history for' 
            }
          },
          required: ['flowId']
        }
      },
      {
        name: 'jump_to_history_point',
        description: 'Jump to a specific point in flow history',
        inputSchema: {
          type: 'object',
          properties: {
            flowId: { 
              type: 'string', 
              description: 'Flow ID' 
            },
            entryId: {
              type: 'string',
              description: 'History entry ID to jump to'
            }
          },
          required: ['flowId', 'entryId']
        }
      },
      {
        name: 'add_note_to_flow',
        description: 'Add a markdown note/README to a flow for documentation',
        inputSchema: {
          type: 'object',
          properties: {
            flowId: {
              type: 'string',
              description: 'Flow ID to add note to'
            },
            markdown: {
              type: 'string',
              description: 'Markdown content for the note'
            },
            position: {
              type: 'object',
              properties: {
                x: { type: 'number' },
                y: { type: 'number' }
              },
              description: 'Canvas position (default: top-left)'
            },
            backgroundColor: {
              type: 'string',
              enum: ['neutral', 'transparent'],
              description: 'Note background color'
            }
          },
          required: ['flowId', 'markdown']
        }
      },
      {
        name: 'get_chat_history',
        description: 'Get chat history for a flow and session_id',
        inputSchema: {
          type: 'object',
          properties: {
            flow_id: { type: 'string', description: 'Flow ID' },
            session_id: { type: 'string', description: 'Session ID' }
          },
          required: ['flow_id', 'session_id']
        }
      },
      {
        name: 'add_chat_message',
        description: 'Add a chat message to history for a flow and session_id',
        inputSchema: {
          type: 'object',
          properties: {
            flow_id: { type: 'string', description: 'Flow ID' },
            session_id: { type: 'string', description: 'Session ID' },
            sender: { type: 'string', description: 'Sender (user or assistant)' },
            message: { type: 'string', description: 'Message text' }
          },
          required: ['flow_id', 'session_id', 'sender', 'message']
        }
      },
      {
        name: 'get_claude_response_with_history',
        description: 'Fetches chat history for a flow/session, calls Claude with the full history, stores and returns the assistant response.',
        inputSchema: {
          type: 'object',
          properties: {
            flow_id: { type: 'string', description: 'Flow ID' },
            session_id: { type: 'string', description: 'Session ID' }
          },
          required: ['flow_id', 'session_id']
        }
      },
      {
        name: 'assistant_chat',
        description: 'Calls the MCP assistant to generate a response (no flow execution).',
        inputSchema: {
          type: 'object',
          properties: {
            flow_id: { type: 'string', description: 'Flow ID' },
            session_id: { type: 'string', description: 'Session ID' },
            message: { type: 'string', description: 'User message' }
          },
          required: ['flow_id', 'session_id', 'message']
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
    const mcpTools = langflowApi
      ? new MCPTools(
          undefined,
          undefined,
          config.langflowApiUrl,
          config.langflowApiKey,
          flowHistory
        )
      : null;

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

        case 'undo_flow_changes': {
          if (!langflowApi) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ error: 'Langflow API not configured' }, null, 2),
              }],
              isError: true,
            };
          }

          const { flowId } = args;

          // Add type validation
          if (typeof flowId !== 'string' || !flowId) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ 
                  success: false,
                  error: 'flowId must be a non-empty string' 
                }, null, 2),
              }],
              isError: true,
            };
          }

          // Check if undo is available
          if (!flowHistory.canUndo(flowId)) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ 
                  success: false,
                  error: 'Nothing to undo for this flow' 
                }, null, 2),
              }],
            };
          }

          // Get previous state
          const previousState = flowHistory.undo(flowId);
          if (!previousState) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ 
                  success: false,
                  error: 'Failed to retrieve previous state' 
                }, null, 2),
              }],
              isError: true,
            };
          }

          // Apply previous state to Langflow
          await langflowApi.updateFlow(flowId, previousState);

          const historyInfo = flowHistory.getHistoryInfo(flowId);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ 
                success: true,
                message: 'Successfully undid last changes',
                flowId,
                historyInfo
              }, null, 2),
            }],
          };
        }

        case 'redo_flow_changes': {
          if (!langflowApi) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ error: 'Langflow API not configured' }, null, 2),
              }],
              isError: true,
            };
          }

          const { flowId } = args;
          
          if (typeof flowId !== 'string' || !flowId) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ 
                  success: false,
                  error: 'flowId must be a non-empty string' 
                }, null, 2),
              }],
              isError: true,
            };
          }

          // Check if redo is available
          if (!flowHistory.canRedo(flowId)) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ 
                  success: false,
                  error: 'Nothing to redo for this flow' 
                }, null, 2),
              }],
            };
          }

          // Get next state
          const nextState = flowHistory.redo(flowId);
          if (!nextState) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ 
                  success: false,
                  error: 'Failed to retrieve next state' 
                }, null, 2),
              }],
              isError: true,
            };
          }

          // Apply next state to Langflow
          await langflowApi.updateFlow(flowId, nextState);

          const historyInfo = flowHistory.getHistoryInfo(flowId);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ 
                success: true,
                message: 'Successfully redid changes',
                flowId,
                historyInfo
              }, null, 2),
            }],
          };
        }

        case 'get_flow_history': {
          const { flowId } = args;
          
          if (typeof flowId !== 'string' || !flowId) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ 
                  success: false,
                  error: 'flowId must be a non-empty string' 
                }, null, 2),
              }],
              isError: true,
            };
          }

          const historyInfo = flowHistory.getHistoryInfo(flowId);

          if (!historyInfo) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ 
                  success: false,
                  error: 'No history found for this flow' 
                }, null, 2),
              }],
            };
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ 
                success: true,
                flowId,
                ...historyInfo
              }, null, 2),
            }],
          };
        }

        case 'jump_to_history_point': {
          if (!langflowApi) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ error: 'Langflow API not configured' }, null, 2),
              }],
              isError: true,
            };
          }

          const { flowId, entryId } = args;

          if (typeof flowId !== 'string' || !flowId) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ 
                  success: false,
                  error: 'flowId must be a non-empty string' 
                }, null, 2),
              }],
              isError: true,
            };
          }

          if (typeof entryId !== 'string' || !entryId) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ 
                  success: false,
                  error: 'entryId must be a non-empty string' 
                }, null, 2),
              }],
              isError: true,
            };
          }

          const targetState = flowHistory.jumpTo(flowId, entryId);
          if (!targetState) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ 
                  success: false,
                  error: 'History entry not found' 
                }, null, 2),
              }],
              isError: true,
            };
          }

          // Apply target state to Langflow
          await langflowApi.updateFlow(flowId, targetState);

          const historyInfo = flowHistory.getHistoryInfo(flowId);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ 
                success: true,
                message: 'Successfully jumped to history point',
                flowId,
                entryId,
                historyInfo
              }, null, 2),
            }],
          };
        }

        case 'add_note_to_flow': {
          if (!langflowApi || !mcpTools) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ error: 'Langflow API not configured' }, null, 2),
              }],
              isError: true,
            };
          }

          const { flowId, markdown, position, backgroundColor } = args;

          // Validate required parameters
          if (typeof flowId !== 'string' || !flowId) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ 
                  success: false,
                  error: 'flowId must be a non-empty string' 
                }, null, 2),
              }],
              isError: true,
            };
          }

          if (typeof markdown !== 'string' || !markdown) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ 
                  success: false,
                  error: 'markdown must be a non-empty string' 
                }, null, 2),
              }],
              isError: true,
            };
          }

          // Build the addNote operation
          const operation = {
            type: 'addNote' as const,
            markdown,
            position: position || { x: 100, y: 100 },
            backgroundColor: backgroundColor || 'neutral'
          };

          // Use tweak_flow to apply the operation
          const req = { 
            params: { flowId }, 
            body: { 
              flowId,
              operations: [operation] 
            } 
          };

          let result: any;
          await mcpTools.tweakFlow(req, {
            json: (data: any) => { result = data; },
            status: (code: number) => ({ json: (data: any) => { result = data; } })
          });

          return { 
            content: [{ 
              type: 'text', 
              text: JSON.stringify(result, null, 2) 
            }] 
          };
        }

        case 'assistant_chat': {
          if (!mcpTools) throw new Error('Langflow API not configured');
          const req = { body: args };
          let result: any;
          await mcpTools.assistant(req, {
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