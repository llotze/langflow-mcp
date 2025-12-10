import express, { Express, Request, Response } from 'express';
import { loadConfig } from '../core/config.js';
import { MCPTools, setBroadcastFunction } from '../tools.js';
import { FlowHistory } from '../services/flowHistory.js';
import cors from 'cors';

// SSE clients registry
const sseClients = new Map<string, Set<Response>>();

/**
 * Broadcasts a flow update event to all subscribers of a specific flow.
 */
export function broadcastFlowUpdate(flowId: string, data: any) {
  const clients = sseClients.get(flowId);
  if (!clients || clients.size === 0) {
    console.log(`No SSE clients subscribed to flow ${flowId}`);
    return;
  }
  
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  console.log(`Broadcasting to ${clients.size} clients for flow ${flowId}`);
  
  clients.forEach(client => {
    try {
      client.write(payload);
    } catch (err) {
      console.error('Failed to write to SSE client:', err);
      clients.delete(client);
    }
  });
}

/**
 * Starts the Langflow MCP REST API server.
 */
async function main() {
  console.log('Starting Langflow MCP Server...');

  const config = loadConfig();
  const { langflowApiKey, ...safeConfig } = config;
  console.log('Configuration loaded:', { ...safeConfig, langflowApiKey: langflowApiKey ? '[SET]' : '[NOT SET]' });

  const flowHistory = new FlowHistory();

  const mcpTools = new MCPTools(
    undefined,
    undefined, 
    config.langflowApiUrl,
    config.langflowApiKey,
    flowHistory
  );

  setBroadcastFunction(broadcastFlowUpdate);

  const app: Express = express();
  app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:7860'],
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key'],
    credentials: true,
  }));
  app.use(express.json());

  /**
   * Health check endpoint.
   */
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      message: 'Langflow MCP Server is running',
      langflowApiEnabled: !!config.langflowApiUrl && !!config.langflowApiKey
    });
  });

  /**
   * SSE endpoint for flow updates.
   * Clients subscribe to real-time flow changes.
   */
  app.get('/mcp/api/flow-updates/:flowId', (req: Request, res: Response) => {
    const { flowId } = req.params;
    
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Register client
    if (!sseClients.has(flowId)) {
      sseClients.set(flowId, new Set());
    }
    sseClients.get(flowId)!.add(res);
    
    console.log(`SSE client connected to flow ${flowId}. Total clients: ${sseClients.get(flowId)!.size}`);

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', flowId })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
      const clients = sseClients.get(flowId);
      if (clients) {
        clients.delete(res);
        console.log(`SSE client disconnected from flow ${flowId}. Remaining: ${clients.size}`);
        if (clients.size === 0) {
          sseClients.delete(flowId);
        }
      }
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
    app.post('/mcp/api/assistant', (req: Request, res: Response) => mcpTools.assistant(req, res));
    
    // Flow History Management
    app.get('/mcp/api/flow-history/:flowId', (req: Request, res: Response) => {
      try {
        const { flowId } = req.params;
        const historyInfo = flowHistory.getHistoryInfo(flowId);
        
        if (!historyInfo) {
          res.status(404).json({
            success: false,
            error: `No history found for flow ${flowId}`
          });
          return;
        }
        
        res.json({
          success: true,
          flowId,
          ...historyInfo
        });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.post('/mcp/api/undo-flow/:flowId', (req: Request, res: Response) => {
      try {
        const { flowId } = req.params;
        const previousState = flowHistory.undo(flowId);
        
        if (!previousState) {
          res.status(400).json({
            success: false,
            error: 'Nothing to undo'
          });
          return;
        }
        
        mcpTools['langflowApi']?.updateFlow(flowId, previousState)
          .then(() => {
            res.json({
              success: true,
              message: 'Successfully undid last changes',
              flowId,
              historyInfo: flowHistory.getHistoryInfo(flowId)
            });
          })
          .catch((err: any) => {
            res.status(500).json({ success: false, error: err.message });
          });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.post('/mcp/api/redo-flow/:flowId', (req: Request, res: Response) => {
      try {
        const { flowId } = req.params;
        const nextState = flowHistory.redo(flowId);
        
        if (!nextState) {
          res.status(400).json({
            success: false,
            error: 'Nothing to redo'
          });
          return;
        }
        
        mcpTools['langflowApi']?.updateFlow(flowId, nextState)
          .then(() => {
            res.json({
              success: true,
              message: 'Successfully redid changes',
              flowId,
              historyInfo: flowHistory.getHistoryInfo(flowId)
            });
          })
          .catch((err: any) => {
            res.status(500).json({ success: false, error: err.message });
          });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.post('/mcp/api/jump-to-history/:flowId/:entryId', (req: Request, res: Response) => {
      try {
        const { flowId, entryId } = req.params;
        const targetState = flowHistory.jumpTo(flowId, entryId);
        
        if (!targetState) {
          res.status(404).json({
            success: false,
            error: `History entry ${entryId} not found`
          });
          return;
        }
        
        mcpTools['langflowApi']?.updateFlow(flowId, targetState)
          .then(() => {
            res.json({
              success: true,
              message: `Jumped to history entry ${entryId}`,
              flowId,
              historyInfo: flowHistory.getHistoryInfo(flowId)
            });
          })
          .catch((err: any) => {
            res.status(500).json({ success: false, error: err.message });
          });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
    
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
    sseClients.forEach((clients, flowId) => {
      clients.forEach(client => {
        client.end();
      });
    });
    process.exit(0);
  });
}

main().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
