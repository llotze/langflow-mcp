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

async function main() {
  const config = loadConfig();

  let langflowApi: LangflowApiService | null = null;
  if (config.langflowApiUrl && config.langflowApiKey) {
    langflowApi = new LangflowApiService(
      config.langflowApiUrl,
      config.langflowApiKey
    );
    await langflowApi.testConnection();
  }

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
        description: 'Apply tweaks to an existing flow by flowId',
        inputSchema: {
          type: 'object',
          properties: {
            flowId: { type: 'string', description: 'Flow ID' },
            tweaks: { type: 'object', description: 'Tweaks to node parameters (nodeId: params)' },
            newName: { type: 'string', description: 'New name for flow' },
            newDescription: { type: 'string', description: 'New description for flow' }
          },
          required: ['flowId', 'tweaks']
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

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const mcpTools = langflowApi
      ? new MCPTools(
          undefined,
          undefined,
          config.langflowApiUrl,
          config.langflowApiKey
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.exit(1);
});