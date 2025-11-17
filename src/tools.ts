import { LangflowApiService } from './services/langflowApiService.js';
import { LangflowComponentService } from './services/LangflowComponentService.js';
import { LangflowFlowBuilder } from './services/LangflowFlowBuilder.js';

export class MCPTools {
    // --- 1. Search Templates ---
    public async searchTemplates(req: any, res: any): Promise<void> {
      try {
        const { keyword, tags, category, component, page = 1, pageSize = 20 } = req.query;
        const flows = await this.langflowApi!.client.get('/api/v1/flows/?get_all=true');
        let results = flows.data;

        // Keyword search (name, description)
        if (keyword) {
          const kw = keyword.toLowerCase();
          results = results.filter((f: any) =>
            (f.name && f.name.toLowerCase().includes(kw)) ||
            (f.description && f.description.toLowerCase().includes(kw))
          );
        }
        // Metadata search (tags, category)
        if (tags) {
          const tagArr = Array.isArray(tags) ? tags : String(tags).split(',');
          results = results.filter((f: any) =>
            f.tags && tagArr.some((t: string) => f.tags.includes(t))
          );
        }
        if (category) {
          results = results.filter((f: any) => f.category === category);
        }
        // Component usage search
        if (component) {
          results = results.filter((f: any) =>
            f.data?.nodes?.some((n: any) => n.type === component)
          );
        }
        // Essentials formatting
        const essentials = results.map((f: any) => ({
          id: f.id,
          name: f.name,
          description: f.description,
          tags: f.tags,
          category: f.category,
          nodes: f.data?.nodes?.map((n: any) => n.type),
        }));
        // Pagination
        const start = (page - 1) * pageSize;
        const paged = essentials.slice(start, start + pageSize);
        res.json({ total: essentials.length, page, pageSize, results: paged });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }

    // --- 2. Get Template ---
    public async getTemplate(req: any, res: any): Promise<void> {
      try {
        const { flowId } = req.params;
        let flow;
        try {
          flow = await this.langflowApi!.client.get(`/api/v1/flows/${flowId}`);
        } catch (err: any) {
          if (err?.response?.status === 404) {
            return res.status(404).json({ error: 'Template not found' });
          }
          return res.status(500).json({ error: err.message });
        }
        if (!flow.data) return res.status(404).json({ error: 'Template not found' });
        // Essentials formatting
        const f = flow.data;
        const essentials = {
          id: f.id,
          name: f.name,
          description: f.description,
          tags: f.tags,
          category: f.category,
          nodes: f.data?.nodes?.map((n: any) => n.type),
          full: f,
        };
        res.json(essentials);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }

    // --- 3. Tweak Template ---
    public async tweakTemplate(req: any, res: any): Promise<void> {
      try {
        const { flowId } = req.params;
        const { tweaks, saveAsNew, newName, newDescription } = req.body;
        // Fetch template
        const flowResp = await this.langflowApi!.client.get(`/api/v1/flows/${flowId}`);
        const flow = flowResp.data;
        if (!flow) return res.status(404).json({ error: 'Template not found' });
        // Apply tweaks (parameter updates)
        if (tweaks && typeof tweaks === 'object') {
          for (const [nodeId, params] of Object.entries(tweaks)) {
            const node = flow.data.nodes.find((n: any) => n.id === nodeId);
            if (node && node.data?.node?.template) {
              Object.assign(node.data.node.template, params);
            }
          }
        }
        // Optionally update name/description
        if (newName) flow.name = newName;
        if (newDescription) flow.description = newDescription;
        // Save as new or update existing
        let result;
        if (saveAsNew) {
          result = await this.langflowApi!.client.post('/api/v1/flows/', {
            name: flow.name,
            description: flow.description,
            data: flow.data,
            tags: flow.tags,
            category: flow.category,
          });
        } else {
          result = await this.langflowApi!.client.patch(`/api/v1/flows/${flowId}`, {
            name: flow.name,
            description: flow.description,
            data: flow.data,
            tags: flow.tags,
            category: flow.category,
          });
        }
        res.json({ success: true, flow: result.data });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }

    // --- 4. Runtime Tweaks (run with tweaks, not persisted) ---
    public async runTemplateWithTweaks(req: any, res: any): Promise<void> {
      try {
        const { flowId } = req.params;
        const { tweaks, input } = req.body;
        // POST to /api/v1/run/{flowId} with tweaks
        const result = await this.langflowApi!.client.post(`/api/v1/run/${flowId}`, {
          input,
          tweaks,
        });
        res.json(result.data);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  private langflowApi?: LangflowApiService;
  private componentService?: LangflowComponentService;
  private flowBuilder?: LangflowFlowBuilder;

  constructor(
    _unused: any,
    _unused2: any,
    langflowApiUrl?: string,
    langflowApiKey?: string
  ) {
    if (langflowApiUrl && langflowApiKey) {
      this.langflowApi = new LangflowApiService(langflowApiUrl, langflowApiKey);
      this.componentService = new LangflowComponentService(this.langflowApi);
      this.flowBuilder = new LangflowFlowBuilder(this.componentService, this.langflowApi);
    }
  }

  /**
   *  API-FIRST: Search components from Langflow API
   */
  public async searchLangflowComponents(req: any, res: any): Promise<void> {
    if (!this.componentService) {
      res.status(503).json({ success: false, error: 'Langflow API not configured' });
      return;
    }
    const { keyword, limit = 20 } = req.query;
    if (!keyword || typeof keyword !== 'string') {
      res.status(400).json({ success: false, error: 'Missing required parameter: keyword' });
      return;
    }
    const results = await this.componentService.searchComponents(keyword, Number(limit));
    res.json({ success: true, data: results });
  }

  /**
   *  API-FIRST: Get component details from Langflow API
   */
  public async getLangflowComponentDetails(req: any, res: any): Promise<void> {
    if (!this.componentService) {
      res.status(503).json({ success: false, error: 'Langflow API not configured' });
      return;
    }
    const { componentName } = req.params;
    const template = await this.componentService.getComponentTemplate(componentName);
    res.json({ success: true, data: template });
  }

  /**
   *  API-FIRST: Build and deploy flow using Langflow API
   */
  public async buildAndDeployFlow(req: any, res: any): Promise<void> {
    if (!this.flowBuilder) {
      res.status(503).json({ success: false, error: 'Langflow API not configured' });
      return;
    }
    const { name, description, nodes, connections } = req.body;
    if (!name || !nodes || !Array.isArray(nodes)) {
      res.status(400).json({ success: false, error: 'Missing required fields: name, nodes (array)' });
      return;
    }
    const result = await this.flowBuilder.buildAndDeployFlow(
      name,
      description || '',
      nodes,
      connections || []
    );
    res.json({
      success: true,
      data: {
        flow_id: result.id,
        url: `${process.env.LANGFLOW_API_URL}/flow/${result.id}`,
      }
    });
  }

  /**
   *  API-FIRST: Create minimal test flow
   */
  public async createMinimalTestFlow(req: any, res: any): Promise<void> {
    if (!this.flowBuilder) {
      res.status(503).json({ success: false, error: 'Langflow API not configured' });
      return;
    }
    const result = await this.flowBuilder.buildAndDeployFlow(
      'Test Flow - API First',
      'Minimal chatbot created using API-first approach',
      [
        {
          component: 'ChatInput',
          id: 'chat_input_1',
          position: { x: 100, y: 200 },
          params: {},
        },
        {
          component: 'OpenAIModel',
          id: 'openai_1',
          position: { x: 400, y: 200 },
          params: {
            api_key: process.env.OPENAI_API_KEY || '',
            model_name: 'gpt-4o-mini',
          },
        },
        {
          component: 'ChatOutput',
          id: 'chat_output_1',
          position: { x: 700, y: 200 },
          params: {},
        },
      ],
      [
        { source: 'chat_input_1', target: 'openai_1', targetParam: 'input_value' },
        { source: 'openai_1', target: 'chat_output_1', targetParam: 'input_value' },
      ]
    );
    res.json({
      success: true,
      data: {
        flow_id: result.id,
        url: `${process.env.LANGFLOW_API_URL}/flow/${result.id}`,
      }
    });
  }
}
