import express, { Express, Request, Response } from 'express';
import { loadConfig, ensureDirectories } from './config';
import { ComponentExtractor } from './componentExtractor';
import { ComponentRegistry } from './registry';
import { MCPTools } from './tools';

async function main() {
  console.log('Starting Langflow MCP Server...');

  // Load configuration
  const config = loadConfig();
  console.log('Configuration loaded:', config);

  // Ensure directories exist
  ensureDirectories(config);

  // Initialize component registry
  const registry = new ComponentRegistry(config.databasePath);
  console.log('Component registry initialized');

  // Initialize component extractor
  const extractor = new ComponentExtractor(config.componentsJsonPath, config.docsPath);
  console.log('Component extractor initialized');

  // Load and register components
  console.log('Loading components...');
  const components = extractor.loadComponents();
  console.log(`Loaded ${components.length} components`);

  for (const component of components) {
    const docs = extractor.loadComponentDocs(component.name);
    await registry.registerComponent(component, docs || undefined);
  }
  console.log('Components registered in database');

  // Initialize MCP tools
  const mcpTools = new MCPTools(registry, config.flowTemplatesPath);

  // Create Express app
  const app: Express = express();
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'Langflow MCP Server is running' });
  });

  // MCP Tool endpoints
  app.get('/mcp/list_components', (req, res) => mcpTools.listComponents(req, res));
  app.post('/mcp/search_components', (req, res) => mcpTools.searchComponents(req, res));
  app.get('/mcp/component/:name/essentials', (req, res) => mcpTools.getComponentEssentials(req, res));
  app.get('/mcp/component/:name/documentation', (req, res) => mcpTools.getComponentDocumentation(req, res));
  app.post('/mcp/validate_component_config', (req, res) => mcpTools.validateComponentConfig(req, res));
  app.post('/mcp/create_flow', (req, res) => mcpTools.createFlow(req, res));
  app.post('/mcp/update_flow_partial', (req, res) => mcpTools.updateFlowPartial(req, res));
  app.get('/mcp/list_flow_templates', (req, res) => mcpTools.listFlowTemplates(req, res));
  app.get('/mcp/flow_template/:name', (req, res) => mcpTools.getFlowTemplate(req, res));
  app.get('/mcp/categories', (req, res) => mcpTools.getCategories(req, res));

  // Start server
  app.listen(config.port, () => {
    console.log(`\n✅ Langflow MCP Server running on http://localhost:${config.port}`);
    console.log(`\nAvailable endpoints:`);
    console.log(`  GET  /health                                  - Health check`);
    console.log(`  GET  /mcp/list_components                     - List all components`);
    console.log(`  POST /mcp/search_components                   - Search components`);
    console.log(`  GET  /mcp/component/:name/essentials          - Get component essentials`);
    console.log(`  GET  /mcp/component/:name/documentation       - Get component documentation`);
    console.log(`  POST /mcp/validate_component_config           - Validate component config`);
    console.log(`  POST /mcp/create_flow                         - Create a new flow`);
    console.log(`  POST /mcp/update_flow_partial                 - Update flow with diff operations`);
    console.log(`  GET  /mcp/list_flow_templates                 - List flow templates`);
    console.log(`  GET  /mcp/flow_template/:name                 - Get flow template`);
    console.log(`  GET  /mcp/categories                          - Get all categories`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    registry.close();
    process.exit(0);
  });
}

// Run the server
main().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
