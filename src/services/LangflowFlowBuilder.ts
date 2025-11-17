import { LangflowComponentService } from './LangflowComponentService.js';
import { LangflowApiService } from './langflowApiService.js';
import { FlowNode, FlowEdge, LangflowFlow } from '../types.js';

// Utility for Langflow's custom handle escaping
function escapeJson(obj: any): string {
  // Langflow expects "œ" instead of regular quotes
  return JSON.stringify(obj, Object.keys(obj).sort()).replace(/"/g, "œ");
}

export class LangflowFlowBuilder {
  constructor(
    private componentService: LangflowComponentService,
    private apiClient: LangflowApiService
  ) {}

  /**
   * Build a node using Langflow's actual component template
   */
  async buildNode(
    componentName: string,
    nodeId: string,
    position: { x: number; y: number },
    parameterValues: Record<string, any> = {},
    index?: number // index for spacing
  ): Promise<FlowNode> {
    // Get the actual template from Langflow
    const componentTemplate = await this.componentService.getComponentTemplate(componentName);
    
    // Clone template to avoid mutation
    const template = JSON.parse(JSON.stringify(componentTemplate.template));

    // Apply user-provided parameter values
    Object.keys(parameterValues).forEach(key => {
      if (template[key]) {
        template[key].value = parameterValues[key];
      }
    });

    // Space nodes horizontally by index to avoid overlap
    const nodePosition = index !== undefined
      ? { x: 100 + index * 350, y: 200 }
      : position;

    // Build node using Langflow's structure
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
   * Build edge using Langflow's connection format
   */
  async buildEdge(
    sourceId: string,
    targetId: string,
    sourceComponent: string,
    targetComponent: string,
    targetParam: string = 'input_value'
  ): Promise<FlowEdge> {
    // Get actual output types from Langflow
    const sourceTemplate = await this.componentService.getComponentTemplate(sourceComponent);
    const targetTemplate = await this.componentService.getComponentTemplate(targetComponent);

    // Use correct output/input port info for handles
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

    // Use Langflow's custom escaping for handles and edge id
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
   * Build complete flow and deploy to Langflow
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
    // Pass index to buildNode for spacing
    const nodes = await Promise.all(
      nodeConfigs.map((config, idx) =>
        this.buildNode(config.component, config.id, config.position, config.params, idx)
      )
    );

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

    // Create flow object
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