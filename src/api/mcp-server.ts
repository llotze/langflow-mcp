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
        name: 'search_langflow_templates',
        description: 'Search Langflow templates by keyword, metadata, or component usage',
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
        name: 'get_langflow_template',
        description: 'Get full or essentials info for a Langflow template by flowId',
        inputSchema: {
          type: 'object',
          properties: {
            flowId: { type: 'string', description: 'Langflow template/flow ID' }
          },
          required: ['flowId']
        }
      },
      {
        name: 'tweak_langflow_template',
        description: 'Apply tweaks to a Langflow template and save as new or update existing',
        inputSchema: {
          type: 'object',
          properties: {
            flowId: { type: 'string', description: 'Langflow template/flow ID' },
            tweaks: { type: 'object', description: 'Tweaks to node parameters (nodeId: params)' },
            saveAsNew: { type: 'boolean', description: 'Save as new template' },
            newName: { type: 'string', description: 'New name for template' },
            newDescription: { type: 'string', description: 'New description for template' }
          },
          required: ['flowId', 'tweaks']
        }
      },
      {
        name: 'run_langflow_template_with_tweaks',
        description: 'Run a Langflow template with runtime tweaks (not persisted)',
        inputSchema: {
          type: 'object',
          properties: {
            flowId: { type: 'string', description: 'Langflow template/flow ID' },
            tweaks: { type: 'object', description: 'Tweaks to node parameters (nodeId: params)' },
            input: { type: 'object', description: 'Input for flow run' }
          },
          required: ['flowId', 'input']
        }
      },
      // Existing tools...
      {
        name: 'search_langflow_components',
        description: 'Search for available Langflow components by keyword',
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
        description: 'Get full template and configuration for a Langflow component',
        inputSchema: {
          type: 'object',
          properties: {
            componentName: { type: 'string', description: 'Component name (e.g., "ChatInput")' }
          },
          required: ['componentName']
        }
      },
      {
        name: 'build_and_deploy_flow',
        description: 'Build a flow from component specifications and deploy to Langflow',
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
      }
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
        // MCPTools logic for template endpoints
        const mcpTools = langflowApi
          ? new (await import('../tools.js')).MCPTools(
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
        case 'search_langflow_templates': {
          if (!mcpTools) throw new Error('Langflow API not configured');
          // Simulate Express req/res
          const req = { query: args };
          let result: any;
          await mcpTools.searchTemplates(req, {
            json: (data: any) => { result = data; },
            status: (code: number) => ({ json: (data: any) => { result = data; } })
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'get_langflow_template': {
          if (!mcpTools) throw new Error('Langflow API not configured');
          const req = { params: args };
          let result: any;
          await mcpTools.getTemplate(req, {
            json: (data: any) => { result = data; },
            status: (code: number) => ({ json: (data: any) => { result = data; } })
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'tweak_langflow_template': {
          if (!mcpTools) throw new Error('Langflow API not configured');
          const req = { params: { flowId: args.flowId }, body: args };
          let result: any;
          await mcpTools.tweakTemplate(req, {
            json: (data: any) => { result = data; },
            status: (code: number) => ({ json: (data: any) => { result = data; } })
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'run_langflow_template_with_tweaks': {
          if (!mcpTools) throw new Error('Langflow API not configured');
          const req = { params: { flowId: args.flowId }, body: args };
          let result: any;
          await mcpTools.runTemplateWithTweaks(req, {
            json: (data: any) => { result = data; },
            status: (code: number) => ({ json: (data: any) => { result = data; } })
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        // Existing tools...
        case 'search_langflow_components': {
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