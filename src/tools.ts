import { LangflowApiService } from './services/langflowApiService.js';
import { LangflowComponentService } from './services/LangflowComponentService.js';
import { LangflowFlowBuilder } from './services/LangflowFlowBuilder.js';
import type { LangflowComponent, FlowNode } from './types.js';
import { listTemplates, loadTemplate } from './utils/templateLoader.js';
import { FlowDiffEngine } from './services/flowDiffEngine.js';
import { FlowValidator } from './services/flowValidator.js';
import { FlowHistory } from './services/flowHistory.js';
import Anthropic from '@anthropic-ai/sdk'; // Make sure you have this installed
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages.mjs";

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

      // Normalize updateNode operations
      for (let i = 0; i < operations.length; i++) {
        operations[i] = normalizeUpdateNodeOperation(operations[i]);
      }

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

  public async getChatHistory(req: any, res: any): Promise<void> {
    try {
      const { flow_id, session_id } = req.body;
      const apiUrl = `${process.env.LANGFLOW_API_URL}/api/v1/chat-history?flow_id=${flow_id}&session_id=${session_id}`;
      const result = await fetch(apiUrl, {
        headers: { "x-api-key": process.env.LANGFLOW_API_KEY || "" }
      });
      const data = await result.json();
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public async addChatMessage(req: any, res: any): Promise<void> {
    try {
      const { flow_id, session_id, sender, message } = req.body;
      const apiUrl = `${process.env.LANGFLOW_API_URL}/api/v1/chat-history`;
      const result = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.LANGFLOW_API_KEY || ""
        },
        body: JSON.stringify({ flow_id, session_id, sender, message })
      });
      const data = await result.json();
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public async getClaudeResponseWithHistory(req: any, res: any): Promise<void> {
    try {
      const { flow_id, session_id } = req.body;
      const { reply } = await this.runClaudeWithHistory({
        flow_id,
        session_id,
        userMessage: undefined, // legacy path (no new user message provided)
      });

      // 5. Store assistant message
      await fetch(`${process.env.LANGFLOW_API_URL}/api/v1/chat-history`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.LANGFLOW_API_KEY || ""
        },
        body: JSON.stringify({
          flow_id,
          session_id,
          sender: "assistant",
          message: reply
        })
      });

      res.json({ success: true, message: reply });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Unified assistant endpoint for Langflow-AI chat panel.
   */
  public async assistant(req: any, res: any): Promise<void> {
    try {
      const { flow_id, session_id, message: userMessage } = req.body;
      
      if (!userMessage || typeof userMessage !== 'string') {
        res.status(400).json({ success: false, error: 'message (string) is required' });
        return;
      }

      // 1. Fetch existing history from Langflow
      const historyApiUrl = `${process.env.LANGFLOW_API_URL}/api/v1/chat-history?flow_id=${flow_id}&session_id=${session_id}`;
      const historyResp = await fetch(historyApiUrl, {
        headers: { "x-api-key": process.env.LANGFLOW_API_KEY || "" }
      });
      const historyData = await historyResp.json();
      const historyArray: any[] = Array.isArray(historyData) ? historyData : []; // ✅ Type it explicitly

      // 2. Add user message to history via Langflow API
      const addMsgUrl = `${process.env.LANGFLOW_API_URL}/api/v1/chat-history`;
      await fetch(addMsgUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.LANGFLOW_API_KEY || ""
        },
        body: JSON.stringify({
          flow_id,
          session_id,
          sender: "user",
          message: userMessage
        })
      });

      // 3. Optionally fetch flow data
      let flow: any = null;
      try {
        flow = await this.langflowApi!.getFlow(flow_id);
      } catch (err) {
        console.warn(`Could not fetch flow ${flow_id}:`, err);
      }

      // 4. Call Claude with full context
      const { reply } = await this.runClaudeWithHistory({
        flow_id,
        session_id,
        userMessage,
        history: historyArray, // ✅ Now properly typed as any[]
        flow
      });

      // 5. Store assistant response via Langflow API
      await fetch(addMsgUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.LANGFLOW_API_KEY || ""
        },
        body: JSON.stringify({
          flow_id,
          session_id,
          sender: "assistant",
          message: reply
        })
      });

      res.json({ success: true, reply });
    } catch (err: any) {
      console.error("assistant endpoint error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Core Claude call with optional injected history and flow.
   */
  private async runClaudeWithHistory(params: {
    flow_id: string;
    session_id: string;
    userMessage?: string;
    history?: any[];
    flow?: any;
  }): Promise<{ reply: string }> {
    const { flow_id, session_id, userMessage, history, flow } = params;

    let historyArray: any[] = history || [];
    if (!history) {
      const apiUrl = `${process.env.LANGFLOW_API_URL}/api/v1/chat-history?flow_id=${flow_id}&session_id=${session_id}`;
      const historyResp = await fetch(apiUrl, {
        headers: { "x-api-key": process.env.LANGFLOW_API_KEY || "" }
      });
      const data = await historyResp.json();
      historyArray = Array.isArray(data) ? data : [];
    }

    const claudeMessages: MessageParam[] = historyArray.map((m: any) => ({
      role: m.sender === "user" ? "user" as const : "assistant" as const,
      content: String(m.message)
    }));

    if (userMessage) {
      claudeMessages.push({
        role: "user",
        content: userMessage,
      });
    }

    const tools: Anthropic.Tool[] = [
      {
        name: "tweak_flow",
        description: "Modify the current Langflow flow by applying operations (add/remove/update nodes and edges)",
        input_schema: {
          type: "object" as const,
          properties: {
            flowId: { type: "string" as const, description: "Flow ID to modify" },
            operations: {
              type: "array" as const,
              description: "Array of operations to apply",
              items: { 
                type: "object" as const,
                properties: {
                  type: { 
                    type: "string" as const,
                    enum: ["updateNode", "addNode", "removeNode", "addEdge", "removeEdge"] as const,
                    description: "Operation type - use 'updateNode' to modify node parameters"
                  },
                  nodeId: { type: "string" as const, description: "Node ID to modify" },
                  updates: {
                    type: "object" as const,
                    description: "Updates to apply - use 'template' key for parameter changes",
                    properties: {
                      template: {
                        type: "object" as const,
                        description: "Template parameter updates"
                      }
                    }
                  },
                  merge: {
                    type: "boolean" as const,
                    description: "Whether to deep merge updates (default: true)"
                  }
                },
                required: ["type", "nodeId"] as const
              }
            }
          },
          required: ["flowId", "operations"] as const
        }
      },
      {
        name: "search_components",
        description: "Search for available Langflow components by keyword",
        input_schema: {
          type: "object" as const,
          properties: {
            keyword: { type: "string" as const, description: "Search term" }
          },
          required: ["keyword"]
        }
      },
      {
        name: "get_component_details",
        description: "Get detailed template for a component",
        input_schema: {
          type: "object" as const,
          properties: {
            componentName: { type: "string" as const, description: "Component name" }
          },
          required: ["componentName"]
        }
      },
      {
        name: "get_flow_details",
        description: "Get the current flow structure",
        input_schema: {
          type: "object" as const,
          properties: {
            flowId: { type: "string" as const, description: "Flow ID" }
          },
          required: ["flowId"]
        }
      }
    ];

    const systemPrompt = `You are Hopper, an AI assistant integrated into Langflow - a visual flow builder for AI applications.

CURRENT CONTEXT:
- You are chatting within Flow ID: ${flow_id}
- Session ID: ${session_id}
${flow ? `- Current flow name: ${flow.name || 'Untitled'}` : ''}

YOUR CAPABILITIES:
1. Answer questions about Langflow and AI workflows
2. Help users build and modify flows using MCP tools
3. Search for components and explain their usage
4. Suggest improvements to the current flow
5. Debug flow issues and provide solutions

AVAILABLE TOOLS:
- tweak_flow: Modify nodes/edges in the current flow
- search_components: Find available Langflow components
- get_component_details: Get detailed info about a component
- get_flow_details: View the current flow structure

When users ask to modify the flow, use the tweak_flow tool with the current flow_id (${flow_id}).
Be helpful, concise, and proactive in suggesting improvements.`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    
    // ✅ FIX: Loop until Claude sends a final message
    let currentMessages = [...claudeMessages];
    let finalText = "";
    let continueLoop = true;
    
    while (continueLoop) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        system: systemPrompt,
        tools: tools,
        messages: currentMessages
      });

      // Check if Claude wants to stop
      if (response.stop_reason === "end_turn" || response.stop_reason === "max_tokens") {
        // Extract all text blocks from final response
        for (const block of response.content) {
          if (block.type === "text") {
            finalText += block.text;
          }
        }
        continueLoop = false;
        break;
      }

      // Process tool uses
      const toolResults: any[] = [];
      let hasTools = false;

      for (const block of response.content) {
        if (block.type === "text") {
          finalText += block.text; // Accumulate partial text
        } else if (block.type === "tool_use") {
          hasTools = true;
          const toolName = block.name;
          const toolInput = block.input;
          
          console.log(`🔧 Claude wants to use tool: ${toolName}`, toolInput);
          
          let toolResult;
          try {
            switch (toolName) {
              case "tweak_flow":
                toolResult = await this.executeTweakFlow(toolInput);
                break;
              case "search_components":
                toolResult = await this.executeSearchComponents(toolInput);
                break;
              case "get_component_details":
                toolResult = await this.executeGetComponentDetails(toolInput);
                break;
              case "get_flow_details":
                toolResult = await this.executeGetFlowDetails(toolInput);
                break;
              default:
                toolResult = { error: `Unknown tool: ${toolName}` };
            }
          } catch (err: any) {
            toolResult = { error: err.message };
          }
          
          toolResults.push({
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: JSON.stringify(toolResult)
          });
        }
      }

      // If no tools were used, we're done
      if (!hasTools) {
        continueLoop = false;
        break;
      }

      // Add assistant response and tool results to conversation
      currentMessages.push(
        { role: "assistant" as const, content: response.content },
        { role: "user" as const, content: toolResults }
      );
    }

    return { reply: finalText || "No response from Claude." };
  }

  // ✅ ADD: Helper methods to execute tools
  private async executeTweakFlow(input: any) {
    // ✅ Translate Claude's operation format to your internal format
    const operations = input.operations.map((op: any) => {
      // If Claude sends "operation" instead of "type", translate it
      if (op.operation && !op.type) {
        return {
          ...op,
          type: op.operation === 'update' ? 'updateNode' : op.operation,
          // Remove the "operation" field
          operation: undefined
        };
      }
      return op;
    });

    const mockReq = { 
      params: { flowId: input.flowId }, 
      body: { 
        ...input,
        operations // Use translated operations
      } 
    };
    
    let result: any;
    await this.tweakFlow(mockReq, {
      json: (data: any) => { result = data; },
      status: (code: number) => ({ json: (data: any) => { result = data; } })
    });
    return result;
  }

  private async executeSearchComponents(input: any) {
    const results = await this.componentService!.searchComponents(input.keyword);
    return { results };
  }

  private async executeGetComponentDetails(input: any) {
    const template = await this.componentService!.getComponentTemplate(input.componentName);
    return { template };
  }

  private async executeGetFlowDetails(input: any) {
    const flow = await this.langflowApi!.getFlow(input.flowId);
    return { flow };
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

/**
 * Normalizes updateNode operations by flattening nested template structures.
 * 
 * @param op - The operation object to normalize
 * @returns The normalized operation object
 */
function normalizeUpdateNodeOperation(op: any) {
  // If updates.data.node.template exists, flatten it to updates.template
  if (
    op.type === 'updateNode' &&
    op.updates &&
    op.updates.data &&
    op.updates.data.node &&
    op.updates.data.node.template
  ) {
    op.updates.template = {};
    for (const [field, valueObj] of Object.entries(op.updates.data.node.template)) {
      // If valueObj is an object with a "value" key, use that
      if (valueObj && typeof valueObj === 'object' && 'value' in valueObj) {
        op.updates.template[field] = valueObj.value;
      } else {
        op.updates.template[field] = valueObj;
      }
    }
    // Remove the nested structure
    delete op.updates.data;
  }
  return op;
}