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

  /**
   * Apply a series of diff operations to a flow
   */
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

    // Validate flow exists
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

    // Apply each operation sequentially
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
        
        // Stop on first error unless continueOnError
        if (!request.continueOnError) {
          result.success = false;
          break;
        }
      }
    }

    // Validate final flow if requested
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
      
      // Add warnings
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

  /**
   * Apply a single operation
   */
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

  /**
   * Add a node to the flow
   */
  private applyAddNode(flow: LangflowFlow, op: AddNodeOperation): LangflowFlow {
    const { node, position } = op;

    // Validate node ID is unique
    if (flow.data.nodes.some(n => n.id === node.id)) {
      throw new Error(`Node with ID "${node.id}" already exists`);
    }

    // Validate node type exists
    if (!node.type) {
      throw new Error(`Node type is required for node "${node.id}"`);
    }

    // Validate component exists
    const component = this.componentCatalog[node.type];
    if (!component) {
      throw new Error(`Unknown component type: "${node.type}"`);
    }

    // Clone and add node
    const newNode = { ...node };
    if (position) {
      newNode.position = position;
    }

    flow.data.nodes.push(newNode);
    return flow;
  }

  /**
   * Remove a node from the flow
   */
  private applyRemoveNode(flow: LangflowFlow, op: RemoveNodeOperation): LangflowFlow {
    const { nodeId, removeConnections = true } = op;

    // Find node index
    const nodeIndex = flow.data.nodes.findIndex(n => n.id === nodeId);
    if (nodeIndex === -1) {
      throw new Error(`Node "${nodeId}" not found`);
    }

    // Remove node
    flow.data.nodes.splice(nodeIndex, 1);

    // Remove connected edges if requested
    if (removeConnections) {
      flow.data.edges = flow.data.edges.filter(
        e => e.source !== nodeId && e.target !== nodeId
      );
    }

    return flow;
  }

  /**
   * Update node properties
   */
  private applyUpdateNode(flow: LangflowFlow, op: UpdateNodeOperation): LangflowFlow {
    const { nodeId, updates, merge = true } = op;

    // Find node
    const node = flow.data.nodes.find(n => n.id === nodeId);
    if (!node) {
      throw new Error(`Node "${nodeId}" not found`);
    }

    // --- FIX: Defensive reconstruction of node.data.node if missing ---
    if (!node.data.node) {
      if (!node.type) {
        throw new Error(`Node "${nodeId}" is missing a "type" property`);
      }
      const component = this.componentCatalog[node.type];
      if (component) {
        // ✅ Deep clone template to avoid mutations
        const clonedTemplate = JSON.parse(JSON.stringify(component.template || {}));
        
        node.data.node = {
          template: clonedTemplate,
          display_name: component.display_name,
          description: component.description,
          base_classes: component.base_classes || [],
          outputs: component.outputs ? JSON.parse(JSON.stringify(component.outputs)) : [],
          icon: component.icon,
          beta: component.beta,
          legacy: component.legacy,
          frozen: component.frozen,
          tool_mode: component.tool_mode,
          edited: false,
          pinned: false,
          minimized: false,
          field_order: component.field_order || [],
          conditional_paths: component.conditional_paths || [],
          custom_fields: component.custom_fields || {},
          metadata: component.metadata || {},
          documentation: component.documentation,
          lf_version: component.lf_version,
          output_types: component.output_types || [],
        };
        
        // ✅ Ensure no "type" or "name" fields leak in
        delete (node.data.node as any).type;
        delete (node.data.node as any).name;
      } else {
        throw new Error(`Component type "${node.type}" not found in catalog`);
      }
    }

    // Apply position update
    if (updates.position) {
      node.position = updates.position;
    }

    // Apply template updates - FIX: Preserve ALL field metadata
    if (updates.template) {
      for (const [key, value] of Object.entries(updates.template)) {
        const existingField = node.data.node.template[key];
        
        if (!existingField) {
          // Field doesn't exist - try to get structure from component catalog
          const componentType = node.type || node.data?.type;
          const component = componentType ? this.componentCatalog[componentType] : undefined;
          
          if (component?.template?.[key]) {
            // ✅ Clone the FULL field structure from catalog
            node.data.node.template[key] = JSON.parse(JSON.stringify(component.template[key]));
            // Then update only the value
            if (typeof node.data.node.template[key] === 'object' && node.data.node.template[key] !== null) {
              node.data.node.template[key].value = value;
            } else {
              node.data.node.template[key] = value;
            }
          } else {
            // ❌ Unknown field - warn and skip to avoid breaking render
            console.warn(`Cannot update unknown field "${key}" for node ${nodeId} (type: ${componentType}). Skipping.`);
            continue;
          }
        } else if (typeof existingField === 'object' && existingField !== null && 'value' in existingField) {
          // Field exists with .value property - preserve ALL metadata, only update value
          node.data.node.template[key] = {
            ...existingField,  // ✅ Keep _input_type, display_name, advanced, etc.
            value: value        // ✅ Update only the value
          };
        } else {
          // Field exists but is not an object with .value - replace entirely
          node.data.node.template[key] = value;
        }
      }
    }

    // Apply display name update
    if (updates.displayName) {
      node.data.node.display_name = updates.displayName;
    }

    return flow;
  }

  /**
   * Move a node to new position
   */
  private applyMoveNode(flow: LangflowFlow, op: MoveNodeOperation): LangflowFlow {
    const { nodeId, position } = op;

    const node = flow.data.nodes.find(n => n.id === nodeId);
    if (!node) {
      throw new Error(`Node "${nodeId}" not found`);
    }

    node.position = position;
    return flow;
  }

  /**
   * Add an edge to the flow
   */
  private applyAddEdge(flow: LangflowFlow, op: AddEdgeOperation): LangflowFlow {
    const { edge, validateConnection = true } = op;

    // Validate nodes exist
    const sourceExists = flow.data.nodes.some(n => n.id === edge.source);
    const targetExists = flow.data.nodes.some(n => n.id === edge.target);

    if (!sourceExists) {
      throw new Error(`Source node "${edge.source}" not found`);
    }
    if (!targetExists) {
      throw new Error(`Target node "${edge.target}" not found`);
    }

    // Check for duplicate edge
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

    // Add edge
    flow.data.edges.push(edge);
    return flow;
  }

  /**
   * Remove an edge from the flow
   */
  private applyRemoveEdge(flow: LangflowFlow, op: RemoveEdgeOperation): LangflowFlow {
    const { source, target, sourceHandle, targetHandle } = op;

    // Find edge index
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

    // Remove edge
    flow.data.edges.splice(edgeIndex, 1);
    return flow;
  }

  /**
   * Update flow metadata
   */
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

  /**
   * Deep clone a flow
   */
  private cloneFlow(flow: LangflowFlow): LangflowFlow {
    return JSON.parse(JSON.stringify(flow));
  }
}