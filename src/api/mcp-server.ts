import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ComponentRegistry } from '../core/registry.js';  
import { ComponentExtractor } from '../core/componentExtractor.js'; 
import { FlowValidator } from '../services/flowValidator.js';
import { FlowDiffEngine } from '../services/flowDiffEngine.js';
import { loadConfig } from '../core/config.js'; 
import { ComponentSearchQuery, LangflowFlow, FlowNode, FlowEdge } from '../types.js';
import { FlowDiffRequest } from '../types/flowDiff.js';
import { LangflowTemplateBuilder } from '../services/langflowTemplateBuilder.js';

async function main() {
  // Setup
  const config = loadConfig();
  const registry = new ComponentRegistry(config.databasePath);
  const extractor = new ComponentExtractor(
    config.componentsJsonPath,
    config.docsPath
  );

  // Load components
  const components = extractor.loadComponents();
  
  // Register all components
  for (const component of components) {
    await registry.registerComponent(component);
  }
  
  const categories = registry.getCategories();
  console.error(`✅ Loaded ${components.length} components across ${categories.length} categories`);

  // Load raw components data for template builder
  const fs = await import('fs');
  const componentsData = JSON.parse(
    fs.readFileSync(config.componentsJsonPath, 'utf-8')
  );

  // Initialize flow services
  const validator = new FlowValidator(registry);
  const diffEngine = new FlowDiffEngine(registry, validator);
  const templateBuilder = new LangflowTemplateBuilder(componentsData); // Pass componentsData

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

  // Register tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'search_components',
        description: 'Search for Langflow components by keyword, category, or filters. Returns matching components with their basic information.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term to match in component names and descriptions' },
            category: { type: 'string', description: 'Filter by specific category (e.g., "models", "agents")' },
            limit: { type: 'number', description: 'Maximum number of results to return (default: 20)' },
            tool_mode: { type: 'boolean', description: 'Filter components by tool mode capability' },
            legacy: { type: 'boolean', description: 'Include legacy/deprecated components (default: false)' },
          },
        },
      },
      {
        name: 'get_component',
        description: 'Get detailed information about a specific Langflow component including all parameters, types, defaults, and configuration options.',
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
        description: 'List all available Langflow component categories. Useful for browsing components by type.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'validate_flow',
        description: 'Validate a Langflow flow configuration before creation or deployment. Checks for: missing required parameters, invalid component types, broken connections, type mismatches, and structural issues. Returns detailed validation results with error messages and suggested fixes.',
        inputSchema: {
          type: 'object',
          properties: {
            flow: {
              type: 'object',
              description: 'The flow object to validate. Must include name and data.nodes array.',
              required: true,
            },
          },
          required: ['flow'],
        },
      },
      {
        name: 'update_flow',
        description: 'Update a Langflow flow using incremental diff operations. THIS IS THE MOST EFFICIENT way to modify flows - sends only changes instead of entire flow JSON (80-90% token savings). Supports atomic operations: addNode, removeNode, updateNode, moveNode, addEdge, removeEdge, updateMetadata. Operations are applied sequentially and validated.',
        inputSchema: {
          type: 'object',
          properties: {
            flow: {
              type: 'object',
              description: 'Current flow state to update',
              required: true,
            },
            operations: {
              type: 'array',
              description: 'Array of diff operations to apply sequentially',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['addNode', 'removeNode', 'updateNode', 'moveNode', 'addEdge', 'removeEdge', 'updateMetadata'],
                    description: 'Type of operation to perform',
                  },
                },
                required: ['type'],
              },
              required: true,
            },
            validateAfter: {
              type: 'boolean',
              description: 'Validate flow after applying operations (default: true)',
            },
            continueOnError: {
              type: 'boolean',
              description: 'Continue applying operations if one fails (default: false)',
            },
          },
          required: ['flow', 'operations'],
        },
      },
      {
        name: 'create_flow',
        description: 'Create a complete Langflow-compatible flow JSON from component specifications. Returns properly formatted flow ready for import.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Flow name' },
            description: { type: 'string', description: 'Flow description' },
            nodes: {
              type: 'array',
              description: 'Array of node specifications',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string', description: 'Component type name' },
                  position: { type: 'object' },
                  parameters: { type: 'object', description: 'Parameter values' }
                }
              }
            },
            edges: {
              type: 'array',
              description: 'Array of edge specifications',
              items: {
                type: 'object',
                properties: {
                  source: { type: 'string' },
                  target: { type: 'string' },
                  targetParam: { type: 'string', description: 'Target parameter name' }
                }
              }
            }
          },
          required: ['name', 'nodes']
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
          
          // Return simplified results for efficiency
          const simplified = results.map(comp => ({
            name: comp.name,
            display_name: comp.display_name,
            category: comp.category,
            description: comp.description,
            parameters_count: comp.parameters.length,
            tool_mode: comp.tool_mode,
          }));
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(simplified, null, 2),
              },
            ],
          };
        }

        case 'get_component': {
          if (!args?.name || typeof args.name !== 'string') {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ error: 'Component name is required' }, null, 2),
                },
              ],
              isError: true,
            };
          }
          
          const component = registry.getComponent(args.name as string);
          if (!component) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ 
                    error: `Component '${args.name}' not found`,
                    suggestion: 'Use search_components to find available components'
                  }, null, 2),
                },
              ],
              isError: true,
            };
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

        case 'validate_flow': {
          if (!args?.flow) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ 
                    error: 'Flow object is required',
                    example: {
                      flow: {
                        name: 'My Flow',
                        data: {
                          nodes: [],
                          edges: []
                        }
                      }
                    }
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          const flow = args.flow as LangflowFlow;
          const result = await validator.validateFlow(flow);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  valid: result.valid,
                  summary: result.summary,
                  issues: result.issues,
                }, null, 2),
              },
            ],
          };
        }

        case 'update_flow': {
          if (!args?.flow || !args?.operations) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ 
                    error: 'Both flow and operations are required',
                    example: {
                      flow: { name: 'My Flow', data: { nodes: [], edges: [] } },
                      operations: [
                        { type: 'addNode', node: { id: 'node-1', type: 'ChatInput', position: { x: 0, y: 0 }, data: {} } }
                      ]
                    }
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          const diffRequest: FlowDiffRequest = {
            flow: args.flow as LangflowFlow,
            operations: args.operations as any[],
            validateAfter: args.validateAfter !== false,
            continueOnError: args.continueOnError === true,
          };

          const result = await diffEngine.applyDiff(diffRequest);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: result.success,
                  operationsApplied: result.operationsApplied,
                  totalOperations: diffRequest.operations.length,
                  updatedFlow: result.flow,
                  errors: result.errors,
                  warnings: result.warnings,
                }, null, 2),
              },
            ],
          };
        }

        case 'create_flow': {
          if (!args?.name || !args?.nodes) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ error: 'name and nodes are required' }, null, 2)
              }],
              isError: true
            };
          }

          // Properly type the flow object
          const flow: LangflowFlow = {
            name: args.name as string,
            description: args.description as string || '',
            data: {
              nodes: [] as FlowNode[],  // Explicitly type as FlowNode[]
              edges: [] as FlowEdge[],  // Explicitly type as FlowEdge[]
              viewport: { x: 0, y: 0, zoom: 1 }
            }
          };

          // Build nodes
          for (const nodeSpec of args.nodes as any[]) {
            const component = registry.getComponent(nodeSpec.type);
            if (!component) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({ 
                    error: `Component '${nodeSpec.type}' not found` 
                  }, null, 2)
                }],
                isError: true
              };
            }

            const node = templateBuilder.buildNode(
              nodeSpec.type,
              component,
              nodeSpec.id,
              nodeSpec.position,
              nodeSpec.parameters || {}
            );

            flow.data.nodes.push(node);
          }

          // Build edges
          if (args.edges && Array.isArray(args.edges)) {
            for (const edgeSpec of args.edges as any[]) {
              const sourceNode = flow.data.nodes.find((n: FlowNode) => n.data?.id === edgeSpec.source);
              const targetNode = flow.data.nodes.find((n: FlowNode) => n.data?.id === edgeSpec.target);

              if (!sourceNode || !targetNode) {
                console.error(`Skipping edge: source or target node not found (${edgeSpec.source} -> ${edgeSpec.target})`);
                continue;
              }

              const sourceComp = registry.getComponent(sourceNode.data.type);
              const targetComp = registry.getComponent(targetNode.data.type);

              if (!sourceComp || !targetComp) {
                console.error(`Skipping edge: component not found for nodes`);
                continue;
              }

              const edge = templateBuilder.buildEdge(
                edgeSpec.source,
                edgeSpec.target,
                sourceComp,
                targetComp,
                edgeSpec.targetParam || 'input_value'
              );

              flow.data.edges.push(edge);
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(flow, null, 2)
            }]
          };
        }

        default:
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ 
                  error: `Unknown tool: ${name}`,
                  available_tools: [
                    'search_components',
                    'get_component', 
                    'list_categories',
                    'validate_flow',
                    'update_flow',
                    'create_flow'
                  ]
                }, null, 2),
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error in tool ${name}:`, error);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ 
              error: errorMessage,
              tool: name,
              stack: error instanceof Error ? error.stack : undefined
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Langflow MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});