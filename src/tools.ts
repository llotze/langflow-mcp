import { LangflowApiService } from './services/langflowApiService.js';
import { LangflowComponentService } from './services/LangflowComponentService.js';
import { LangflowFlowBuilder } from './services/LangflowFlowBuilder.js';
import type { LangflowComponent, FlowNode } from './types.js';
import { listTemplates, loadTemplate } from './utils/templateLoader.js';
import { FlowDiffEngine } from './services/flowDiffEngine.js';
import { FlowValidator } from './services/flowValidator.js';
import { FlowHistory } from './services/flowHistory.js';

/**
 * Flattens nested component catalog into a single-level map.
 * 
 * Converts Langflow's category-based structure into a flat lookup
 * for easier component access by name.
 */
function flattenComponentCatalog(catalog: any): Record<string, LangflowComponent> {
  const flat: Record<string, LangflowComponent> = {};
  for (const category in catalog) {
    for (const name in catalog[category]) {
      flat[name] = catalog[category][name];
    }
  }
  return flat;
}

/**
 * MCPTools provides MCP server endpoints for Langflow operations.
 * 
 * Handles template management, flow creation/modification, component search,
 * and flow execution. Acts as the bridge between MCP protocol and Langflow API.
 */
export class MCPTools {
  private langflowApi?: LangflowApiService;
  private componentService?: LangflowComponentService;
  private flowBuilder?: LangflowFlowBuilder;
  private flowHistory: FlowHistory;  // Add history

  /**
   * Creates a new MCPTools instance.
   * 
   * @param _config - Reserved for future server configuration
   * @param _logger - Reserved for future logging implementation
   * @param langflowApiUrl - Langflow instance URL
   * @param langflowApiKey - API key for authentication
   */
  constructor(
    _config?: any,
    _logger?: any,
    langflowApiUrl?: string,
    langflowApiKey?: string,
    flowHistory?: FlowHistory  // Accept optional history instance
  ) {
    if (langflowApiUrl && langflowApiKey) {
      this.langflowApi = new LangflowApiService(langflowApiUrl, langflowApiKey);
      this.componentService = new LangflowComponentService(this.langflowApi);
      this.flowBuilder = new LangflowFlowBuilder(this.componentService, this.langflowApi);
    }
    
    this.flowHistory = flowHistory || new FlowHistory();
  }

  /**
   * Searches available flow templates by keyword and tags.
   * 
   * Supports pagination for large template collections.
   */
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

  /**
   * Retrieves a specific template by ID.
   */
  public async getTemplate(req: any, res: any): Promise<void> {
    try {
      const { templateId } = req.params;
      const template = loadTemplate(templateId);
      res.json(template);
    } catch (err: any) {
      res.status(404).json({ error: 'Template not found' });
    }
  }

  /**
   * Creates a new flow from a template.
   * 
   * Applies Langflow-specific handle encoding and removes spaces
   * from edge handles to ensure proper connection validation.
   */
  public async createFlowFromTemplate(req: any, res: any): Promise<void> {
    try {
      const { templateId } = req.params;
      const { name, description } = req.body;
      const template = loadTemplate(templateId);

      // Encode edge handles for Langflow compatibility
      if (template.data?.edges) {
        template.data.edges = template.data.edges.map((edge: any) => {
          function encodeHandle(handle: string) {
            let encoded = handle;
            if (typeof encoded === 'string' && !encoded.includes('œ')) {
              try {
                const obj = JSON.parse(encoded.replace(/œ/g, '"'));
                encoded = JSON.stringify(obj, Object.keys(obj).sort()).replace(/"/g, "œ");
              } catch {
                // Leave as-is if not parseable
              }
            }
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
      
      res.json({ 
        success: true, 
        flowId: flow.id,
        name: flow.name,
        message: `Flow created successfully. ID: ${flow.id}`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Applies differential updates to an existing flow.
   * 
   * Supports node updates, edge modifications, and metadata changes.
   * Operations are applied sequentially and validated before persisting.
   * 
   * Pre-processes template updates to unwrap nested value objects,
   * ensuring parameter values are applied correctly.
   */
  public async tweakFlow(req: any, res: any): Promise<void> {
    try {
      console.log("RAW tweakFlow request body:", req.body);
      const translated = translateTweakFlowRequest({ ...req.body, flowId: req.params.flowId || req.body.flowId });
      console.log("Translated tweakFlow request:", translated);
      const { flowId, operations, validateAfter = true, continueOnError = false } = translated;
      
      // Pre-process operations to unwrap nested values
      for (const op of operations) {
        if (op.type === 'updateNode' && op.updates?.template) {
          for (const [fieldName, fieldValue] of Object.entries(op.updates.template)) {
            if (typeof fieldValue === 'object' && fieldValue !== null && 'value' in fieldValue) {
              console.log(`Pre-unwrapping ${fieldName}: ${JSON.stringify(fieldValue)} -> ${(fieldValue as any).value}`);
              op.updates.template[fieldName] = (fieldValue as any).value;
            }
          }
        }
      }

      if (!flowId || !Array.isArray(operations) || operations.length === 0) {
        res.status(400).json({
          error: "Missing flowId or operations array. Only 'operations' is supported. Example:",
          received: translated,
          example: {
            flowId: "FLOW_ID",
            operations: [
              { type: "updateNode", nodeId: "openai_1", updates: { template: { temperature: 0.9 } }, merge: true }
            ]
          }
        });
        return;
      }
      
      const flow = await this.langflowApi!.getFlow(flowId);
      if (!flow) {
        res.status(404).json({ error: 'Flow not found' });
        return;
      }
      
      if (!flow.data || !Array.isArray(flow.data.nodes) || !Array.isArray(flow.data.edges)) {
        res.status(500).json({ error: 'Flow data is missing nodes or edges array.' });
        return;
      }

      const rawCatalog = await this.componentService!.getAllComponents();
      const componentCatalog = flattenComponentCatalog(rawCatalog);
      
      // Normalize component types (ensure data.type matches catalog)
      for (const node of flow.data.nodes as FlowNode[]) {
        if (node.type === "genericNode" && node.data?.node?.metadata?.module) {
          const modulePath: string = node.data.node.metadata.module;
          let className = modulePath.split('.').pop();
          
          if ((className === "PromptComponent" || className === "PromptTemplate") && componentCatalog["Prompt"]) {
            className = "Prompt";
          }
          
          if (className && componentCatalog[className] && node.data) {
            console.log(`Setting data.type for ${node.id} to ${className}`);
            node.data.type = className;
          }
        }
      }

      // Remove nodes with invalid component types
      const validTypes = new Set(Object.keys(componentCatalog));
      validTypes.add("Prompt");
      validTypes.add("noteNode");
      validTypes.add("genericNode");

      flow.data.nodes = (flow.data.nodes as FlowNode[]).filter(
        (node: FlowNode) => typeof node.type === "string" && validTypes.has(node.type)
      );

      const diffRequest = {
        flow,
        operations,
        validateAfter: false,
        continueOnError: false
      };
      
      const rawCatalog2 = await this.componentService!.getAllComponents();
      const componentCatalog2 = flattenComponentCatalog(rawCatalog2);
      const flowDiffEngine = new FlowDiffEngine(
        componentCatalog2,
        new FlowValidator(componentCatalog2),
        this.flowHistory  // Pass history to engine
      );
      
      const result = await flowDiffEngine.applyDiff(diffRequest);
      
      if (!result.success) {
        res.status(400).json({ success: false, errors: result.errors, warnings: result.warnings });
        return;
      }
      
      if (!result.flow || !result.flow.data || !Array.isArray(result.flow.data.nodes)) {
        res.status(500).json({ 
          success: false, 
          error: 'FlowDiffEngine returned invalid flow structure',
          result: result 
        });
        return;
      }
      
      const updated = await this.langflowApi!.updateFlow(flowId, result.flow);
      
      res.json({ 
        success: true, 
        flowId: updated.id,
        name: updated.name,
        operationsApplied: result.operationsApplied, 
        warnings: result.warnings,
        message: `Flow ${updated.id} updated successfully with ${result.operationsApplied} operations`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Executes a flow with the provided inputs.
   */
  public async runFlow(req: any, res: any): Promise<void> {
    try {
      const { flowId } = req.params;
      const { input } = req.body;
      const result = await this.langflowApi!.runFlow(flowId, input || {});
      
      res.json({ 
        success: true, 
        flowId: flowId,
        outputCount: result.outputs?.length || 0,
        message: `Flow ${flowId} executed successfully`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Retrieves complete flow details including all nodes and edges.
   * WARNING: Can return large payloads.
   */
  public async getFlowDetails(req: any, res: any): Promise<void> {
    try {
      const { flowId } = req.params;
      const flow = await this.langflowApi!.getFlow(flowId);
      res.json({ success: true, flow });
    } catch (err: any) {
      res.status(404).json({ error: 'Flow not found' });
    }
  }

  /**
   * Searches for Langflow components by keyword.
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
   * Retrieves detailed template information for a component.
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
   * Builds and deploys a flow from component specifications.
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
   * Creates a minimal test chatbot flow for API testing.
   * Uses hardcoded OpenAI credentials from environment.
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
   * Returns essential information about a component.
   * 
   * Filters out advanced parameters to provide a focused view
   * of the most commonly used configuration options.
   */
  public async getComponentEssentials(req: any, res: any): Promise<void> {
    if (!this.componentService) {
      res.status(503).json({ success: false, error: 'Langflow API not configured' });
      return;
    }
    const { componentName } = req.params;
    try {
      const component = await this.componentService.getComponentTemplate(componentName);
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
   * Searches component parameters by keyword.
   * 
   * Useful for finding specific configuration options without
   * loading the entire component definition.
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

/**
 * Searches component parameters by keyword.
 * 
 * Matches against parameter name, display name, and description.
 */
export function searchComponentParams(parameters: any[], query: string) {
  const queryLower = query.toLowerCase();
  return parameters.filter(p =>
    (p.name && p.name.toLowerCase().includes(queryLower)) ||
    (p.display_name && p.display_name.toLowerCase().includes(queryLower)) ||
    (p.description && p.description.toLowerCase().includes(queryLower))
  );
}

/**
 * Translates legacy tweak request format to operations-based format.
 * 
 * @throws Error if operations array is missing or invalid
 */
function translateTweakFlowRequest(body: any) {
  if (Array.isArray(body.operations) && body.operations.length > 0) {
    return {
      flowId: body.flowId,
      operations: body.operations,
      validateAfter: false,
      continueOnError: !!body.continueOnError
    };
  }
  throw new Error(
    "Missing or invalid 'operations' array. Only 'operations' is supported. Example: { flowId: 'FLOW_ID', operations: [ { type: 'updateNode', nodeId: 'openai_1', updates: { template: { temperature: 0.9 } }, merge: true } ] }"
  );
}