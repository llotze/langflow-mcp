import { LangflowApiService } from './services/langflowApiService.js';
import { LangflowComponentService } from './services/LangflowComponentService.js';
import { LangflowFlowBuilder } from './services/LangflowFlowBuilder.js';
import type { LangflowComponent } from './types.js';
import { listTemplates, loadTemplate } from './utils/templateLoader.js';
import { FlowDiffEngine } from './services/flowDiffEngine.js';
import { FlowValidator } from './services/flowValidator.js';

// Helper to flatten nested component catalog
function flattenComponentCatalog(catalog: any): Record<string, LangflowComponent> {
  const flat: Record<string, LangflowComponent> = {};
  for (const category in catalog) {
    for (const name in catalog[category]) {
      flat[name] = catalog[category][name];
    }
  }
  return flat;
}

export class MCPTools {
  // --- 1. Search Templates ---
  public async searchTemplates(req: any, res: any): Promise<void> {
    try {
      const { keyword, tags, page = 1, pageSize = 20 } = req.query;
      let templates = listTemplates();

      if (keyword) {
        const kw = keyword.toLowerCase();
        templates = templates.filter(t =>
          t.name.toLowerCase().includes(kw) ||
          t.description.toLowerCase().includes(kw)
        );
      }
      if (tags) {
        const tagArr = Array.isArray(tags) ? tags : String(tags).split(',');
        templates = templates.filter(t =>
          t.tags && tagArr.some((tag: string) => t.tags.includes(tag))
        );
      }
      const start = (page - 1) * pageSize;
      const paged = templates.slice(start, start + pageSize);
      res.json({ total: templates.length, page, pageSize, results: paged });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- 2. Get Template ---
  public async getTemplate(req: any, res: any): Promise<void> {
    try {
      const { templateId } = req.params;
      const template = loadTemplate(templateId);
      res.json(template);
    } catch (err: any) {
      res.status(404).json({ error: 'Template not found' });
    }
  }

  // --- 3. Create Flow from Template ---
  public async createFlowFromTemplate(req: any, res: any): Promise<void> {
    try {
      const { templateId } = req.params;
      const { name, description } = req.body;
      const template = loadTemplate(templateId);

      // Ensure edge handles are properly encoded for Langflow (no spaces)
      if (template.data?.edges) {
        template.data.edges = template.data.edges.map((edge: any) => {
          function encodeHandle(handle: string) {
            // Remove spaces after encoding
            let encoded = handle;
            if (typeof encoded === 'string' && !encoded.includes('œ')) {
              try {
                const obj = JSON.parse(encoded.replace(/œ/g, '"'));
                encoded = JSON.stringify(obj, Object.keys(obj).sort()).replace(/"/g, "œ");
              } catch {
                // If not parseable, leave as is
              }
            }
            // Remove all spaces
            return typeof encoded === 'string' ? encoded.replace(/\s+/g, '') : encoded;
          }
          if (edge.sourceHandle) edge.sourceHandle = encodeHandle(edge.sourceHandle);
          if (edge.targetHandle) edge.targetHandle = encodeHandle(edge.targetHandle);
          return edge;
        });
      }

      const flow = await this.langflowApi!.createFlow({
        name: name || template.name,
        description: description || template.description,
        data: template.data,
        tags: template.tags,
      });
      res.json({ success: true, flow });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- 4. Tweak Flow ---
  public async tweakFlow(req: any, res: any): Promise<void> {
    try {
      const { flowId } = req.params;
      const { operations, validateAfter = true, continueOnError = false } = req.body;
      if (!flowId || !Array.isArray(operations)) {
        res.status(400).json({ error: 'Missing flowId or operations array' });
        return;
      }
      const flow = await this.langflowApi!.getFlow(flowId);
      if (!flow) {
        res.status(404).json({ error: 'Flow not found' });
        return;
      }
      // Defensive check for flow structure
      if (
        !flow.data ||
        !Array.isArray(flow.data.nodes) ||
        !Array.isArray(flow.data.edges)
      ) {
        res.status(500).json({ error: 'Flow data is missing nodes or edges array.' });
        return;
      }
      const diffRequest = {
        flow,
        operations,
        validateAfter,
        continueOnError
      };
      const rawCatalog = await this.componentService!.getAllComponents();
      const componentCatalog = flattenComponentCatalog(rawCatalog);
      const flowDiffEngine = new FlowDiffEngine(
        componentCatalog,
        new FlowValidator(componentCatalog)
      );
      const result = await flowDiffEngine.applyDiff(diffRequest);
      if (!result.success) {
        res.status(400).json({ success: false, errors: result.errors, warnings: result.warnings });
        return;
      }
      const updated = await this.langflowApi!.updateFlow(flowId, result.flow);
      res.json({ success: true, flow: updated, operationsApplied: result.operationsApplied, warnings: result.warnings });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- 5. Run Flow ---
  public async runFlow(req: any, res: any): Promise<void> {
    try {
      const { flowId } = req.params;
      const { input } = req.body;
      const result = await this.langflowApi!.runFlow(flowId, input || {});
      res.json({ success: true, flow_id: flowId, outputs: result.outputs });
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

  /**
   * Get essentials for a Langflow component
   */
  public async getComponentEssentials(req: any, res: any): Promise<void> {
    if (!this.componentService) {
      res.status(503).json({ success: false, error: 'Langflow API not configured' });
      return;
    }
    const { componentName } = req.params;
    try {
      const component = await this.componentService.getComponentTemplate(componentName);
      // Extract essentials
      const essentials = {
        componentName: component.name,
        displayName: component.display_name,
        description: component.description,
        requiredParameters: (component.parameters || []).filter((p: any) => p.required),
        commonParameters: (component.parameters || []).filter((p: any) => !p.advanced).slice(0, 5),
        examples: {}, 
        metadata: {
          totalParameters: (component.parameters || []).length,
        }
      };
      res.json({ success: true, data: essentials });
    } catch (err: any) {
      res.status(404).json({ success: false, error: err.message });
    }
  }

  /**
   * Search properties in a Langflow component
   */
  public async searchComponentProperties(req: any, res: any): Promise<void> {
    if (!this.componentService) {
      res.status(503).json({ success: false, error: 'Langflow API not configured' });
      return;
    }
    const { componentName } = req.params;
    const { query } = req.query;
    try {
      const component = await this.componentService.getComponentTemplate(componentName);
      const matches = searchComponentParams(component.parameters || [], query);
      res.json({
        success: true,
        data: {
          componentName: component.name,
          query,
          matches,
          totalMatches: matches.length,
          searchedIn: (component.parameters || []).length
        }
      });
    } catch (err: any) {
      res.status(404).json({ success: false, error: err.message });
    }
  }
}

// Helper for recursive property search
export function searchComponentParams(parameters: any[], query: string) {
  const queryLower = query.toLowerCase();
  return parameters.filter(p =>
    (p.name && p.name.toLowerCase().includes(queryLower)) ||
    (p.display_name && p.display_name.toLowerCase().includes(queryLower)) ||
    (p.description && p.description.toLowerCase().includes(queryLower))
  );
}
