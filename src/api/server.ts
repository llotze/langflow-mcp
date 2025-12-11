import express, { Express, Request, Response, NextFunction } from 'express';
import { loadConfig } from '../core/config.js';
import { MCPTools, setBroadcastFunction } from '../tools.js';
import { FlowHistory } from '../services/flowHistory.js';
import cors from 'cors';

// SSE clients registry
const sseClients = new Map<string, Set<Response>>();

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
 * Validates user API key and attaches it to request context.
 * Returns 401 with setup instructions if key is missing.
 */
function authenticateUser(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  
  if (!apiKey || apiKey.trim().length === 0) {
    return res.status(401).json({
      success: false,
      error: 'API key required',
      instructions: {
        message: 'Please set your Langflow API key to use Hopper',
        steps: [
          '1. Go to Langflow Settings → API Keys',
          '2. Click "Create New API Key"',
          '3. Copy the generated key',
          '4. Paste it in the Hopper chat settings'
        ]
      }
    });
  }
  
  (req as any).userApiKey = apiKey;
  next();
}

async function main() {
  console.log('Starting Langflow MCP Server...');

  const config = loadConfig();
  console.log('Configuration loaded:', {
    port: config.port,
    langflowApiUrl: config.langflowApiUrl || '[NOT SET]',
  });

  const flowHistory = new FlowHistory();
  setBroadcastFunction(broadcastFlowUpdate);

  const app: Express = express();
  app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:7860','https://www.graceful-ai.com',
              'https://graceful-ai.com',  /\.railway\.app$/, /\.vercel\.app$/],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization'],
    credentials: true,
  }));
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      message: 'Langflow MCP Server is running',
      langflowApiEnabled: !!config.langflowApiUrl
    });
  });

  // Server-Sent Events endpoint for real-time flow updates
  app.get('/mcp/api/flow-updates/:flowId', (req: Request, res: Response) => {
    const { flowId } = req.params;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!sseClients.has(flowId)) {
      sseClients.set(flowId, new Set());
    }
    sseClients.get(flowId)!.add(res);
    
    console.log(`SSE client connected to flow ${flowId}. Total clients: ${sseClients.get(flowId)!.size}`);
    res.write(`data: ${JSON.stringify({ type: 'connected', flowId })}\n\n`);

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

  // Apply authentication to all MCP API endpoints
  app.use('/mcp/api', authenticateUser);

  if (config.langflowApiUrl) {
    
    // All endpoints create per-request MCPTools instances with user's API key
    app.post('/mcp/api/tweak-flow/:flowId', async (req: Request, res: Response) => {
      const userApiKey = (req as any).userApiKey;
      const mcpTools = new MCPTools(
        undefined, 
        undefined, 
        config.langflowApiUrl, 
        userApiKey,
        flowHistory
      );
      await mcpTools.tweakFlow(req, res);
    });

    app.post('/mcp/api/assistant', async (req: Request, res: Response) => {
      const userApiKey = (req as any).userApiKey;
      const mcpTools = new MCPTools(
        undefined, 
        undefined, 
        config.langflowApiUrl, 
        userApiKey,
        flowHistory
      );
      await mcpTools.assistant(req, res);
    });

    app.post('/mcp/api/run-flow/:flowId', async (req: Request, res: Response) => {
      const userApiKey = (req as any).userApiKey;
      const mcpTools = new MCPTools(
        undefined, 
        undefined, 
        config.langflowApiUrl, 
        userApiKey,
        flowHistory
      );
      await mcpTools.runFlow(req, res);
    });

    app.get('/mcp/api/flow-details/:flowId', async (req: Request, res: Response) => {
      const userApiKey = (req as any).userApiKey;
      const mcpTools = new MCPTools(
        undefined, 
        undefined, 
        config.langflowApiUrl, 
        userApiKey,
        flowHistory
      );
      await mcpTools.getFlowDetails(req, res);
    });

    app.get('/mcp/api/search', async (req, res) => {
      const userApiKey = (req as any).userApiKey;
      const mcpTools = new MCPTools(
        undefined, 
        undefined, 
        config.langflowApiUrl, 
        userApiKey,
        flowHistory
      );
      await mcpTools.searchLangflowComponents(req, res);
    });

    app.get('/mcp/api/components/:componentName', async (req, res) => {
      const userApiKey = (req as any).userApiKey;
      const mcpTools = new MCPTools(
        undefined, 
        undefined, 
        config.langflowApiUrl, 
        userApiKey,
        flowHistory
      );
      await mcpTools.getLangflowComponentDetails(req, res);
    });

    app.get('/mcp/api/component-essentials/:componentName', async (req, res) => {
      const userApiKey = (req as any).userApiKey;
      const mcpTools = new MCPTools(
        undefined, 
        undefined, 
        config.langflowApiUrl, 
        userApiKey,
        flowHistory
      );
      await mcpTools.getComponentEssentials(req, res);
    });

    app.get('/mcp/api/search-component-properties/:componentName', async (req, res) => {
      const userApiKey = (req as any).userApiKey;
      const mcpTools = new MCPTools(
        undefined, 
        undefined, 
        config.langflowApiUrl, 
        userApiKey,
        flowHistory
      );
      await mcpTools.searchComponentProperties(req, res);
    });

    app.post('/mcp/api/build-flow', async (req, res) => {
      const userApiKey = (req as any).userApiKey;
      const mcpTools = new MCPTools(
        undefined, 
        undefined, 
        config.langflowApiUrl, 
        userApiKey,
        flowHistory
      );
      await mcpTools.buildAndDeployFlow(req, res);
    });

    app.post('/mcp/api/test-flow', async (req, res) => {
      const userApiKey = (req as any).userApiKey;
      const mcpTools = new MCPTools(
        undefined, 
        undefined, 
        config.langflowApiUrl, 
        userApiKey,
        flowHistory
      );
      await mcpTools.createMinimalTestFlow(req, res);
    });

    // Template operations (same pattern)
    app.get('/mcp/api/search-templates', async (req: Request, res: Response) => {
      const userApiKey = (req as any).userApiKey;
      const mcpTools = new MCPTools(
        undefined, 
        undefined, 
        config.langflowApiUrl, 
        userApiKey,
        flowHistory
      );
      await mcpTools.searchTemplates(req, res);
    });

    app.get('/mcp/api/get-template/:templateId', async (req: Request, res: Response) => {
      const userApiKey = (req as any).userApiKey;
      const mcpTools = new MCPTools(
        undefined, 
        undefined, 
        config.langflowApiUrl, 
        userApiKey,
        flowHistory
      );
      await mcpTools.getTemplate(req, res);
    });

    app.post('/mcp/api/create-flow-from-template/:templateId', async (req: Request, res: Response) => {
      const userApiKey = (req as any).userApiKey;
      const mcpTools = new MCPTools(
        undefined, 
        undefined, 
        config.langflowApiUrl, 
        userApiKey,
        flowHistory
      );
      await mcpTools.createFlowFromTemplate(req, res);
    });

  } else {
    console.log('Langflow API integration disabled - missing API URL');
  }

  // ✅ Use Railway's PORT env variable, fallback to 3001
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : config.port;

  // ✅ Bind to 0.0.0.0 for Railway (allows external connections)
  const HOST = process.env.HOST || '0.0.0.0';

  app.listen(PORT, HOST, () => {
    // ✅ Show Railway URL if available, otherwise localhost
    const url = process.env.RAILWAY_PUBLIC_DOMAIN 
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://${HOST}:${PORT}`;
    
    console.log(`✅ Server started successfully on ${url}`);
  });

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
