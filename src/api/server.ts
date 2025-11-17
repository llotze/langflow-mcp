import express, { Express, Request, Response } from 'express';
import { loadConfig } from '../core/config.js';
import { MCPTools } from '../tools.js';

async function main() {
  console.log('Starting Langflow MCP Server...');

  const config = loadConfig();
  // Redact API key before logging
  const { langflowApiKey, ...safeConfig } = config;
  console.log('Configuration loaded:', { ...safeConfig, langflowApiKey: langflowApiKey ? '[SET]' : '[NOT SET]' });

  // Pass only API credentials
  const mcpTools = new MCPTools(
    undefined,
    undefined, 
    config.langflowApiUrl,
    config.langflowApiKey
  );

  const app: Express = express();
  app.use(express.json());

  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      message: 'Langflow MCP Server is running',
      langflowApiEnabled: !!config.langflowApiUrl && !!config.langflowApiKey
    });
  });

  // API-first endpoints
  if (config.langflowApiUrl && config.langflowApiKey) {
      // --- Template Endpoints (search/get/tweak/run) ---
      app.get('/mcp/api/search-templates', (req: Request, res: Response) => mcpTools.searchTemplates(req, res));
      app.get('/mcp/api/get-template/:flowId', (req: Request, res: Response) => mcpTools.getTemplate(req, res));
      app.post('/mcp/api/tweak-template/:flowId', (req: Request, res: Response) => mcpTools.tweakTemplate(req, res));
      app.post('/mcp/api/run-template/:flowId', (req: Request, res: Response) => mcpTools.runTemplateWithTweaks(req, res));
    app.get('/mcp/api/search', (req, res) => mcpTools.searchLangflowComponents(req, res));
    app.get('/mcp/api/components/:componentName', (req, res) => mcpTools.getLangflowComponentDetails(req, res));
    app.post('/mcp/api/build-flow', (req, res) => mcpTools.buildAndDeployFlow(req, res));
    app.post('/mcp/api/test-flow', (req, res) => mcpTools.createMinimalTestFlow(req, res));
    app.get('/mcp/langflow/flows/:flowId', async (req, res) => {
      try {
        const flow = await mcpTools['langflowApi']?.getFlow(req.params.flowId);
        if (flow) {
          res.json({ success: true, data: flow });
        } else {
          res.status(404).json({ success: false, error: 'Flow not found' });
        }
      } catch (err: any) {
        res.status(404).json({ success: false, error: err.message });
      }
    });
  } else {
    console.log('Langflow API integration disabled');
  }

  app.listen(config.port, () => {
    console.log(`Server started successfully on http://localhost:${config.port}`);
  });

  process.on('SIGINT', () => {
    process.exit(0);
  });
}

main().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
