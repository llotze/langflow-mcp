import { 
  LangflowComponent, 
  FlowNode, 
  FlowEdge, 
  LangflowFlow 
} from '../types.js';

export class LangflowTemplateBuilder {
  private componentsCache: Map<string, any> = new Map();

  constructor(private componentsData: any) {
    // Pre-cache all component templates
    this.cacheComponentTemplates();
  }

  private cacheComponentTemplates(): void {
    Object.keys(this.componentsData).forEach(category => {
      const categoryComponents = this.componentsData[category];
      Object.keys(categoryComponents).forEach(componentName => {
        const component = categoryComponents[componentName];
        this.componentsCache.set(componentName, component);
      });
    });
  }

  /**
   * Get template directly from components.json
   */
  private getComponentTemplate(componentType: string): any {
    const component = this.componentsCache.get(componentType);
    if (!component || !component.template) {
      throw new Error(`Component template not found for: ${componentType}`);
    }
    return component.template;
  }

  /**
   * Build node using exact template from components.json
   */
  buildNode(
    componentType: string,
    component: LangflowComponent,
    nodeId: string,
    position: { x: number; y: number },
    parameterValues: Record<string, any>
  ): FlowNode {
    // Get the exact template from components.json
    const baseTemplate = this.getComponentTemplate(componentType);
    
    // Deep clone the template
    const template: Record<string, any> = JSON.parse(JSON.stringify(baseTemplate));

    // Apply user-provided parameter values
    Object.keys(parameterValues).forEach(paramName => {
      if (template[paramName]) {
        template[paramName].value = parameterValues[paramName];
      }
    });

    // Get the cached component data
    const componentData = this.componentsCache.get(componentType);

    return {
      id: nodeId,
      type: 'genericNode',
      position,
      data: {
        id: nodeId,
        type: componentType,
        node: {
          template,
          display_name: component.display_name,
          description: component.description,
          base_classes: component.base_classes || [],
          outputs: componentData.outputs || [],
          icon: component.icon,
          beta: component.beta || false,
          legacy: component.legacy || false,
          frozen: component.frozen || false,
          field_order: component.field_order || [],
          conditional_paths: [],
          custom_fields: {},
          edited: false,
          pinned: false,
          metadata: componentData.metadata || {},
          category: component.category,
          key: componentType,
          documentation: component.documentation_link || '',
          lf_version: '1.4.2',
          minimized: componentData.minimized || false,
          output_types: componentData.output_types || [],
          tool_mode: component.tool_mode || false,
          priority: 0
        },
        selected_output: this.getSelectedOutput(component),
        showNode: true
      },
      measured: { height: 234, width: 320 },
      selected: false,
      dragging: false
    };
  }

  private getSelectedOutput(component: LangflowComponent): string {
    if (!component.output_types || component.output_types.length === 0) {
      return 'message';
    }
    
    const componentData = this.componentsCache.get(component.name);
    if (componentData && componentData.outputs && componentData.outputs.length > 0) {
      return componentData.outputs[0].name;
    }
    
    return 'message';
  }

  buildEdge(
    sourceId: string,
    targetId: string,
    sourceComponent: LangflowComponent,
    targetComponent: LangflowComponent,
    targetParam: string = 'input_value'
  ): FlowEdge {
    // Get output from source component
    const sourceData = this.componentsCache.get(sourceComponent.name);
    const sourceOutput = sourceData?.outputs?.[0] || { name: 'output', types: ['Message'] };
    
    // Build handles
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
      inputTypes: ['Message'],
      type: sourceOutput.selected || 'Message'
    };

    const edgeId = `reactflow__edge-${sourceId}${JSON.stringify(sourceHandle)}-${targetId}${JSON.stringify(targetHandle)}`;
    
    return {
      id: edgeId,
      source: sourceId,
      target: targetId,
      sourceHandle: JSON.stringify(sourceHandle),
      targetHandle: JSON.stringify(targetHandle),
      data: {
        sourceHandle,
        targetHandle
      },
      animated: false,
      selected: false,
      className: ''
    };
  }

  buildFlow(
    name: string,
    description: string,
    nodes: FlowNode[],
    edges: FlowEdge[]
  ): LangflowFlow { 
    return {
      name,
      description,
      data: {
        nodes,
        edges,
        viewport: {
          x: 0,
          y: 0,
          zoom: 1
        }
      }
    };
  }

  buildOutputs(component: LangflowComponent): any[] {
    const componentData = this.componentsCache.get(component.name);
    if (componentData && componentData.outputs) {
      return componentData.outputs;
    }

    // Fallback
    if (!component.output_types || component.output_types.length === 0) {
      return [{
        allows_loop: false,
        cache: true,
        display_name: 'Output',
        group_outputs: false,
        method: 'build',
        name: 'output',
        selected: 'Message',
        tool_mode: true,
        types: ['Message'],
        value: '__UNDEFINED__'
      }];
    }

    return component.output_types.map(type => ({
      allows_loop: false,
      cache: true,
      display_name: type,
      group_outputs: false,
      method: 'build',
      name: type.toLowerCase(),
      selected: type,
      tool_mode: true,
      types: [type],
      value: '__UNDEFINED__'
    }));
  }
}