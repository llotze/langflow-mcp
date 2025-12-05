import { LangflowComponentService } from './LangflowComponentService.js';
import { LangflowApiService } from './langflowApiService.js';
import { FlowNode, FlowEdge, LangflowFlow } from '../types.js';

/**
 * Escapes JSON for Langflow's custom handle format.
 * 
 * Langflow uses a non-standard JSON encoding where double quotes are
 * replaced with "œ" characters in handle identifiers. This ensures
 * handle strings match Langflow's expected format.
 * 
 * @param obj - Object to serialize
 * @returns Escaped JSON string with "œ" instead of quotes
 */
function escapeJson(obj: any): string {
  return JSON.stringify(obj, Object.keys(obj).sort()).replace(/"/g, "œ");
}

/**
 * LangflowFlowBuilder constructs flows programmatically using component templates.
 * 
 * This builder provides a high-level API for creating flows without manually
 * constructing node and edge objects. It handles:
 * - Retrieving component templates from the catalog
 * - Applying parameter values to templates
 * - Generating proper connection handles
 * - Creating flow structures that match Langflow's internal format
 * 
 * Use this when you need to create flows from scratch or generate flows
 * from external configurations or templates.
 */
export class LangflowFlowBuilder {
  constructor(
    private componentService: LangflowComponentService,
    private apiClient: LangflowApiService
  ) {}

  /**
   * Constructs a flow node from a component template.
   * 
   * @param componentName - Component type (e.g., "ChatInput", "OpenAIModel")
   * @param nodeId - Unique identifier for this node instance
   * @param position - Canvas coordinates for node placement
   * @param parameterValues - Parameter overrides to apply to the template
   * @param index - Optional index for automatic horizontal spacing
   * @returns Complete node object ready for inclusion in a flow
   * 
   * The node includes:
   * - Full component template with applied parameter values
   * - Display metadata (name, description, icons)
   * - Output type definitions for connection validation
   * - Standard dimensions and positioning
   * 
   * If `index` is provided, nodes are spaced horizontally at 350px intervals
   * to prevent overlap in the canvas view.
   */
  async buildNode(
    componentName: string,
    nodeId: string,
    position: { x: number; y: number },
    parameterValues: Record<string, any> = {},
    index?: number
  ): Promise<FlowNode> {
    const componentTemplate = await this.componentService.getComponentTemplate(componentName);
    
    // Clone template to avoid mutating cached catalog data
    const template = JSON.parse(JSON.stringify(componentTemplate.template));

    // Apply user-provided parameter values
    Object.keys(parameterValues).forEach(key => {
      if (template[key]) {
        template[key].value = parameterValues[key];
      }
    });

    // Automatic horizontal spacing if index provided
    const nodePosition = index !== undefined
      ? { x: 100 + index * 350, y: 200 }
      : position;

    return {
      id: nodeId,
      type: 'genericNode',
      position: nodePosition,
      data: {
        id: nodeId,
        type: componentName,
        node: {
          template,
          display_name: componentTemplate.display_name,
          description: componentTemplate.description,
          base_classes: componentTemplate.base_classes || [],
          outputs: componentTemplate.outputs || [],
        }
      },
      measured: { height: 234, width: 320 },
      width: 320,
      height: 234,
      selected: false,
      dragging: false,
    } as FlowNode;
  }

  /**
   * Constructs an edge connecting two nodes with proper handle formatting.
   * 
   * @param sourceId - ID of the source node
   * @param targetId - ID of the target node
   * @param sourceComponent - Component type of source node
   * @param targetComponent - Component type of target node
   * @param targetParam - Target parameter name to connect to (default: "input_value")
   * @returns Complete edge object with Langflow-specific handle encoding
   * 
   * Edges in Langflow use specially formatted handle strings that encode:
   * - Source output types and metadata
   * - Target input types and field information
   * - Data type compatibility information
   * 
   * The handle strings are encoded using Langflow's custom JSON format
   * with "œ" characters instead of quotes, ensuring proper connection
   * validation in the Langflow UI.
   */
  async buildEdge(
    sourceId: string,
    targetId: string,
    sourceComponent: string,
    targetComponent: string,
    targetParam: string = 'input_value'
  ): Promise<FlowEdge> {
    const sourceTemplate = await this.componentService.getComponentTemplate(sourceComponent);
    const targetTemplate = await this.componentService.getComponentTemplate(targetComponent);

    // Extract output/input port metadata from templates
    const sourceOutput = sourceTemplate.outputs?.[0] || { name: 'message', types: ['Message'] };
    const targetInput = targetTemplate.template[targetParam];

    const sourceHandleObj = {
      dataType: sourceComponent,
      id: sourceId,
      name: sourceOutput.name,
      output_types: sourceOutput.types || ['Message']
    };

    const targetHandleObj = {
      fieldName: targetParam,
      id: targetId,
      inputTypes: targetInput?.input_types || ['Message'],
      type: targetInput?.type || 'str'
    };

    // Apply Langflow's custom escaping for handle identifiers
    const sourceHandleStr = escapeJson(sourceHandleObj);
    const targetHandleStr = escapeJson(targetHandleObj);

    return {
      id: `reactflow__edge-${sourceId}${sourceHandleStr}-${targetId}${targetHandleStr}`,
      source: sourceId,
      target: targetId,
      sourceHandle: sourceHandleStr,
      targetHandle: targetHandleStr,
      data: { sourceHandle: sourceHandleObj, targetHandle: targetHandleObj },
      animated: false,
      selected: false,
      className: ''
    };
  }

  /**
   * Builds a complete flow and deploys it to Langflow.
   * 
   * @param name - Flow name
   * @param description - Flow description
   * @param nodeConfigs - Array of node configurations
   * @param connections - Array of connection specifications
   * @returns Created workflow from Langflow API
   * 
   * This is the primary method for programmatic flow creation. It:
   * 1. Constructs all nodes from component templates
   * 2. Applies parameter values to each node
   * 3. Creates edges between nodes with proper handles
   * 4. Assembles the complete flow structure
   * 5. Deploys the flow to Langflow via API
   * 
   * Nodes are automatically spaced horizontally to prevent overlap.
   * The flow is validated by Langflow before creation.
   * 
   * Example:
   * ```typescript
   * await builder.buildAndDeployFlow(
   *   "My Chatbot",
   *   "A simple chatbot",
   *   [
   *     { component: "ChatInput", id: "input-1", position: {x:0,y:0}, params: {} },
   *     { component: "OpenAIModel", id: "llm-1", position: {x:0,y:0}, params: { temperature: 0.7 } }
   *   ],
   *   [{ source: "input-1", target: "llm-1" }]
   * );
   * ```
   */
  async buildAndDeployFlow(
    name: string,
    description: string,
    nodeConfigs: Array<{
      component: string;
      id: string;
      position: { x: number; y: number };
      params: Record<string, any>;
    }>,
    connections: Array<{
      source: string;
      target: string;
      targetParam?: string;
    }>
  ): Promise<any> {
    // Build all nodes with automatic spacing
    const nodes = await Promise.all(
      nodeConfigs.map((config, idx) =>
        this.buildNode(config.component, config.id, config.position, config.params, idx)
      )
    );

    // Build all edges with proper handle formatting
    const edges = await Promise.all(
      connections.map(conn => {
        const sourceNode = nodeConfigs.find(n => n.id === conn.source);
        const targetNode = nodeConfigs.find(n => n.id === conn.target);
        return this.buildEdge(
          conn.source,
          conn.target,
          sourceNode!.component,
          targetNode!.component,
          conn.targetParam
        );
      })
    );

    // Assemble complete flow structure
    const flow: LangflowFlow = {
      name,
      description,
      data: {
        nodes,
        edges,
        viewport: { x: 0, y: 0, zoom: 1 }
      }
    };

    // Deploy to Langflow
    return await this.apiClient.createFlow(flow);
  }
}