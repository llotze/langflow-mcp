import express, { Express, Request, Response } from 'express';
import { loadConfig } from '../core/config.js';
import { MCPTools } from '../tools.js';

/**
 * Starts the Langflow MCP REST API server.
 * 
 * Initializes an Express server that exposes MCP tools as REST endpoints.
 * This server runs independently of the stdio MCP server and provides
 * HTTP access to all Langflow operations.
 * 
 * The server provides:
 * - Template management endpoints
 * - Flow CRUD operations
 * - Component search and discovery
 * - Flow execution and monitoring
 * - Health check endpoint
 * 
 * All endpoints are prefixed with `/mcp/api/` to avoid conflicts.
 */
async function main() {
  console.log('Starting Langflow MCP Server...');

  const config = loadConfig();
  const { langflowApiKey, ...safeConfig } = config;
  console.log('Configuration loaded:', { ...safeConfig, langflowApiKey: langflowApiKey ? '[SET]' : '[NOT SET]' });

  // Initialize MCP tools with Langflow API credentials
  const mcpTools = new MCPTools(
    undefined,
    undefined, 
    config.langflowApiUrl,
    config.langflowApiKey
  );

  const app: Express = express();
  app.use(express.json());

  /**
   * Health check endpoint.
   * Returns server status and Langflow API connectivity.
   */
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      message: 'Langflow MCP Server is running',
      langflowApiEnabled: !!config.langflowApiUrl && !!config.langflowApiKey
    });
  });

  // Register Langflow API endpoints only if credentials are configured
  if (config.langflowApiUrl && config.langflowApiKey) {
    // Template Management
    app.get('/mcp/api/search-templates', (req: Request, res: Response) => mcpTools.searchTemplates(req, res));
    app.get('/mcp/api/get-template/:templateId', (req: Request, res: Response) => mcpTools.getTemplate(req, res));
    app.post('/mcp/api/create-flow-from-template/:templateId', (req: Request, res: Response) => mcpTools.createFlowFromTemplate(req, res));
    
    // Flow Operations
    app.post('/mcp/api/tweak-flow/:flowId', (req: Request, res: Response) => mcpTools.tweakFlow(req, res));
    app.post('/mcp/api/run-flow/:flowId', (req: Request, res: Response) => mcpTools.runFlow(req, res));
    app.get('/mcp/api/flow-details/:flowId', (req: Request, res: Response) => mcpTools.getFlowDetails(req, res));
    
    // Component Discovery
    app.get('/mcp/api/search', (req, res) => mcpTools.searchLangflowComponents(req, res));
    app.get('/mcp/api/components/:componentName', (req, res) => mcpTools.getLangflowComponentDetails(req, res));
    app.get('/mcp/api/component-essentials/:componentName', (req, res) => mcpTools.getComponentEssentials(req, res));
    app.get('/mcp/api/search-component-properties/:componentName', (req, res) => mcpTools.searchComponentProperties(req, res));
    
    // Flow Building
    app.post('/mcp/api/build-flow', (req, res) => mcpTools.buildAndDeployFlow(req, res));
    app.post('/mcp/api/test-flow', (req, res) => mcpTools.createMinimalTestFlow(req, res));
    
    // Direct Langflow API proxy endpoint
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
    console.log('Langflow API integration disabled - missing credentials');
  }

  // Start server
  app.listen(config.port, () => {
    console.log(`Server started successfully on http://localhost:${config.port}`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    process.exit(0);
  });
}

main().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
