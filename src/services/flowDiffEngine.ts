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
      const validation = await this.validator.validateFlow(result.flow);
      
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

    // Apply position update
    if (updates.position) {
      node.position = updates.position;
    }

    // Apply template updates
    if (updates.template) {
      if (merge) {
        // Merge with existing template
        node.data.node.template = {
          ...node.data.node.template,
          ...updates.template,
        };
      } else {
        // Replace entire template
        node.data.node.template = updates.template;
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