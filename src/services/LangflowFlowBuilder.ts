import { LangflowComponentService } from './LangflowComponentService.js';
import { LangflowApiService } from './langflowApiService.js';
import { FlowNode, FlowEdge, LangflowFlow } from '../types.js';

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
    parameterValues: Record<string, any> = {}
  ): Promise<FlowNode> {
    // Get the ACTUAL template from Langflow
    const componentTemplate = await this.componentService.getComponentTemplate(componentName);
    
    // Clone template to avoid mutation
    const template = JSON.parse(JSON.stringify(componentTemplate.template));

    // Apply user-provided parameter values
    Object.keys(parameterValues).forEach(key => {
      if (template[key]) {
        template[key].value = parameterValues[key];
      }
    });

    // Build node using Langflow's EXACT structure
    return {
      id: nodeId,
      type: 'genericNode', // Langflow always uses this
      position,
      data: {
        id: nodeId,
        type: componentName,
        node: {
          template,
          display_name: componentTemplate.display_name,
          description: componentTemplate.description,
          base_classes: componentTemplate.base_classes || [],
          outputs: componentTemplate.outputs || [],
          // ... other metadata from componentTemplate
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

    const sourceOutput = sourceTemplate.outputs?.[0] || { name: 'output', types: ['Message'] };
    const targetInput = targetTemplate.template[targetParam];

    const sourceHandle = {
      baseClasses: sourceOutput.types || ['Message'],
      dataType: sourceOutput.selected || sourceOutput.types?.[0] || 'Message',
      id: sourceId,
      name: sourceOutput.name,
      output_types: sourceOutput.types || ['Message']
    };

    const targetHandle = {
      fieldName: targetParam,
      id: targetId,
      inputTypes: targetInput?.input_types || ['Message'],
      type: targetInput?.type || 'Message'
    };

    return {
      id: `reactflow__edge-${sourceId}${JSON.stringify(sourceHandle)}-${targetId}${JSON.stringify(targetHandle)}`,
      source: sourceId,
      target: targetId,
      sourceHandle: JSON.stringify(sourceHandle),
      targetHandle: JSON.stringify(targetHandle),
      data: { sourceHandle, targetHandle },
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
    // Build nodes
    const nodes = await Promise.all(
      nodeConfigs.map(config =>
        this.buildNode(config.component, config.id, config.position, config.params)
      )
    );

    // Build edges
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