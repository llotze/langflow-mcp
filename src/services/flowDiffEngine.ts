import { LangflowComponent, LangflowFlow, FlowNode, FlowEdge } from '../types.js';
import {
  FlowDiffOperation,
  FlowDiffRequest,
  FlowDiffResult,
  AddNodeOperation,
  RemoveNodeOperation,
  UpdateNodeOperation,
  MoveNodeOperation,
  AddEdgeOperation,
  RemoveEdgeOperation,
  UpdateMetadataOperation,
} from '../types/flowDiff.js';
import { FlowValidator, ValidationResult } from './flowValidator.js';

export class FlowDiffEngine {
  constructor(
    private componentCatalog: Record<string, LangflowComponent>,
    private validator: FlowValidator
  ) {}

  async applyDiff(request: FlowDiffRequest): Promise<FlowDiffResult> {
    const result: FlowDiffResult = {
      success: true,
      flow: this.cloneFlow(request.flow!),
      operationsApplied: 0,
      applied: [],
      failed: [],
      errors: [],
      warnings: [],
    };

    if (!result.flow) {
      return {
        ...result,
        success: false,
        errors: ['Flow is required'],
      };
    }

    console.log("FlowDiffEngine.applyDiff: Input flow structure:", {
      hasFlow: !!request.flow,
      hasData: !!request.flow?.data,
      hasNodes: !!request.flow?.data?.nodes,
      nodesLength: request.flow?.data?.nodes?.length,
      nodesIsArray: Array.isArray(request.flow?.data?.nodes)
    });

    for (let i = 0; i < request.operations.length; i++) {
      const operation = request.operations[i];
      
      try {
        result.flow = await this.applyOperation(result.flow, operation);
        result.operationsApplied++;
        result.applied.push(i);
      } catch (error: any) {
        result.failed.push(i);
        result.errors.push(
          `Operation ${i} (${operation.type}): ${error.message}`
        );
        
        if (!request.continueOnError) {
          result.success = false;
          break;
        }
      }
    }

    if (request.validateAfter !== false && result.success) {
      console.log("FlowDiffEngine: Starting validation. Nodes:", result.flow.data.nodes.length);
      const validation = await this.validator.validateFlow(result.flow);
      console.log("FlowDiffEngine: Validation result:", { valid: validation.valid, issues: validation.issues });
      
      if (!validation.valid) {
        result.success = false;
        result.errors.push(
          `Flow validation failed after applying operations:`,
          ...validation.issues
            .filter(i => i.severity === 'error')
            .map(i => `  - ${i.message}`)
        );
      }
      
      validation.issues
        .filter(i => i.severity === 'warning')
        .forEach(i => result.warnings.push(i.message));
    }

    console.log("FlowDiffEngine.applyDiff: Output flow structure:", {
      hasFlow: !!result.flow,
      hasData: !!result.flow?.data,
      hasNodes: !!result.flow?.data?.nodes,
      nodesLength: result.flow?.data?.nodes?.length,
      nodesIsArray: Array.isArray(result.flow?.data?.nodes)
    });

    return result;
  }

  private async applyOperation(
    flow: LangflowFlow,
    operation: FlowDiffOperation
  ): Promise<LangflowFlow> {
    switch (operation.type) {
      case 'addNode':
        return this.applyAddNode(flow, operation);
      case 'removeNode':
        return this.applyRemoveNode(flow, operation);
      case 'updateNode':
        return this.applyUpdateNode(flow, operation);
      case 'moveNode':
        return this.applyMoveNode(flow, operation);
      case 'addEdge':
        return this.applyAddEdge(flow, operation);
      case 'removeEdge':
        return this.applyRemoveEdge(flow, operation);
      case 'updateMetadata':
        return this.applyUpdateMetadata(flow, operation);
      default:
        throw new Error(`Unknown operation type: ${(operation as any).type}`);
    }
  }

  private applyAddNode(flow: LangflowFlow, op: AddNodeOperation): LangflowFlow {
    const { node, position } = op;

    if (flow.data.nodes.some(n => n.id === node.id)) {
      throw new Error(`Node with ID "${node.id}" already exists`);
    }

    if (!node.type) {
      throw new Error(`Node type is required for node "${node.id}"`);
    }

    const component = this.componentCatalog[node.type];
    if (!component) {
      throw new Error(`Unknown component type: "${node.type}"`);
    }

    const newNode = { ...node };
    if (position) {
      newNode.position = position;
    }

    flow.data.nodes.push(newNode);
    return flow;
  }

  private applyRemoveNode(flow: LangflowFlow, op: RemoveNodeOperation): LangflowFlow {
    const { nodeId, removeConnections = true } = op;

    const nodeIndex = flow.data.nodes.findIndex(n => n.id === nodeId);
    if (nodeIndex === -1) {
      throw new Error(`Node "${nodeId}" not found`);
    }

    flow.data.nodes.splice(nodeIndex, 1);

    if (removeConnections) {
      flow.data.edges = flow.data.edges.filter(
        e => e.source !== nodeId && e.target !== nodeId
      );
    }

    return flow;
  }

  private applyUpdateNode(flow: LangflowFlow, op: UpdateNodeOperation): LangflowFlow {
    const node = flow.data.nodes.find((n: FlowNode) => n.id === op.nodeId);
    if (!node) {
      throw new Error(`Node ${op.nodeId} not found in flow`);
    }

    const templateUpdates: Record<string, any> = {};
    
    if (op.updates.template && node.data?.node?.template) {
      console.log(`Merging template updates for ${op.nodeId}`);
      
      for (const [fieldName, fieldValue] of Object.entries(op.updates.template)) {
        if (node.data.node.template[fieldName]) {
          let actualValue = fieldValue;
          if (typeof fieldValue === 'object' && fieldValue !== null && 'value' in fieldValue) {
            actualValue = (fieldValue as any).value;
            console.log(`Unwrapped nested value for ${fieldName}: ${JSON.stringify(fieldValue)} -> ${actualValue}`);
          }
          
          templateUpdates[fieldName] = actualValue;
          node.data.node.template[fieldName].value = actualValue;
          console.log(`Updated ${fieldName} = ${actualValue} (type: ${typeof actualValue})`);
        } else {
          console.warn(`Field ${fieldName} not found in component template`);
        }
      }
      
      const { template, ...otherUpdates } = op.updates;
      op.updates = otherUpdates;
    }

    const deepMerge = (target: any, source: any): any => {
      if (!source || typeof source !== 'object') return source;
      if (!target || typeof target !== 'object') return source;
      
      const result = { ...target };
      
      for (const key in source) {
        if (source[key] === null || source[key] === undefined) {
          continue;
        }
        
        if (typeof source[key] !== 'object' || source[key] === null) {
          if (target[key] !== undefined && typeof target[key] === 'object' && typeof source[key] !== 'object') {
            console.warn(`Type mismatch for ${key}: target is object, source is ${typeof source[key]}. Skipping.`);
            continue;
          }
          result[key] = source[key];
        } 
        else if (typeof target[key] === 'object' && target[key] !== null) {
          result[key] = deepMerge(target[key], source[key]);
        } 
        else {
          result[key] = source[key];
        }
      }
      
      return result;
    };

    if (op.merge && node.data) {
      node.data = deepMerge(node.data, op.updates);
    } else {
      Object.assign(node.data, op.updates);
    }

    const componentType = node.data?.type;
    if (componentType && this.componentCatalog[componentType]) {
      const componentTemplate = this.componentCatalog[componentType];
      const nodeTemplate = JSON.parse(JSON.stringify(componentTemplate.template || {}));
      
      if (node.data.node?.template && nodeTemplate) {
        for (const fieldName in nodeTemplate) {
          if (templateUpdates.hasOwnProperty(fieldName)) {
            nodeTemplate[fieldName].value = templateUpdates[fieldName];
            console.log(`Applied saved update for ${fieldName}: ${templateUpdates[fieldName]}`);
          } else if (node.data.node?.template?.[fieldName]?.value !== undefined) {
            nodeTemplate[fieldName].value = node.data.node.template[fieldName].value;
          }
        }
      }
      
      node.data.node = {
        ...componentTemplate,
        template: nodeTemplate
      };
      
      delete (node.data.node as any).type;
      delete (node.data.node as any).name;
    }

    return flow;
  }

  private applyMoveNode(flow: LangflowFlow, op: MoveNodeOperation): LangflowFlow {
    const { nodeId, position } = op;

    const node = flow.data.nodes.find(n => n.id === nodeId);
    if (!node) {
      throw new Error(`Node "${nodeId}" not found`);
    }

    node.position = position;
    return flow;
  }

  private applyAddEdge(flow: LangflowFlow, op: AddEdgeOperation): LangflowFlow {
    const { edge, validateConnection = true } = op;

    const sourceExists = flow.data.nodes.some(n => n.id === edge.source);
    const targetExists = flow.data.nodes.some(n => n.id === edge.target);

    if (!sourceExists) {
      throw new Error(`Source node "${edge.source}" not found`);
    }
    if (!targetExists) {
      throw new Error(`Target node "${edge.target}" not found`);
    }

    const duplicate = flow.data.edges.some(
      e =>
        e.source === edge.source &&
        e.target === edge.target &&
        e.sourceHandle === edge.sourceHandle &&
        e.targetHandle === edge.targetHandle
    );

    if (duplicate) {
      throw new Error(
        `Edge from "${edge.source}" to "${edge.target}" already exists`
      );
    }

    flow.data.edges.push(edge);
    return flow;
  }

  private applyRemoveEdge(flow: LangflowFlow, op: RemoveEdgeOperation): LangflowFlow {
    const { source, target, sourceHandle, targetHandle } = op;

    const edgeIndex = flow.data.edges.findIndex(
      e =>
        e.source === source &&
        e.target === target &&
        (sourceHandle === undefined || e.sourceHandle === sourceHandle) &&
        (targetHandle === undefined || e.targetHandle === targetHandle)
    );

    if (edgeIndex === -1) {
      throw new Error(`Edge from "${source}" to "${target}" not found`);
    }

    flow.data.edges.splice(edgeIndex, 1);
    return flow;
  }

  private applyUpdateMetadata(
    flow: LangflowFlow,
    op: UpdateMetadataOperation
  ): LangflowFlow {
    const { updates } = op;

    if (updates.name !== undefined) {
      flow.name = updates.name;
    }

    if (updates.description !== undefined) {
      flow.description = updates.description;
    }

    if (updates.tags !== undefined) {
      flow.tags = updates.tags;
    }

    if (updates.metadata !== undefined) {
      flow.metadata = {
        ...flow.metadata,
        ...updates.metadata,
      };
    }

    return flow;
  }

  private cloneFlow(flow: LangflowFlow): LangflowFlow {
    return JSON.parse(JSON.stringify(flow));
  }
}