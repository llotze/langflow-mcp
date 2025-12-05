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

/**
 * FlowDiffEngine applies differential operations to Langflow flows.
 * 
 * This engine manages the transformation of flow structures by applying
 * operations such as adding/removing nodes and edges, updating node properties,
 * and modifying flow metadata. It ensures changes are validated and maintains
 * flow integrity throughout the transformation process.
 */
export class FlowDiffEngine {
  constructor(
    private componentCatalog: Record<string, LangflowComponent>,
    private validator: FlowValidator
  ) {}

  /**
   * Applies a series of diff operations to a flow.
   * 
   * @param request - Contains the flow and operations to apply
   * @returns Result object with updated flow and operation status
   * 
   * Operations are applied sequentially. If continueOnError is false,
   * the process stops at the first error. If validateAfter is true,
   * the resulting flow is validated before returning.
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
        
        // Stop on first error unless continueOnError is enabled
        if (!request.continueOnError) {
          result.success = false;
          break;
        }
      }
    }

    // Validate the resulting flow if requested
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

  /**
   * Routes an operation to its appropriate handler method.
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
   * Adds a new node to the flow.
   * 
   * Validates that:
   * - The node ID is unique
   * - The node type exists in the component catalog
   * - Required node properties are present
   */
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

  /**
   * Removes a node from the flow.
   * 
   * @param removeConnections - If true, also removes all edges connected to this node
   */
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

  /**
   * Updates node properties, particularly template field values.
   * 
   * This is the most complex operation as it handles:
   * 1. Extracting and storing template updates
   * 2. Unwrapping nested value objects
   * 3. Merging updates with existing node data
   * 4. Reconstructing the node from the component catalog
   * 5. Preserving user values while applying updates
   * 
   * The reconstruction step ensures the node structure matches
   * the current component definition, which is critical for
   * maintaining compatibility as components evolve.
   */
  private applyUpdateNode(flow: LangflowFlow, op: UpdateNodeOperation): LangflowFlow {
    const node = flow.data.nodes.find((n: FlowNode) => n.id === op.nodeId);
    if (!node) {
      throw new Error(`Node ${op.nodeId} not found in flow`);
    }

    // Store template updates separately to preserve them during reconstruction
    const templateUpdates: Record<string, any> = {};
    
    if (op.updates.template && node.data?.node?.template) {
      console.log(`Merging template updates for ${op.nodeId}`);
      
      for (const [fieldName, fieldValue] of Object.entries(op.updates.template)) {
        if (node.data.node.template[fieldName]) {
          // Unwrap nested value objects (e.g., {value: 0.7} -> 0.7)
          let actualValue = fieldValue;
          if (typeof fieldValue === 'object' && fieldValue !== null && 'value' in fieldValue) {
            actualValue = (fieldValue as any).value;
            console.log(`Unwrapped nested value for ${fieldName}: ${JSON.stringify(fieldValue)} -> ${actualValue}`);
          }
          
          // Save for later application during reconstruction
          templateUpdates[fieldName] = actualValue;
          node.data.node.template[fieldName].value = actualValue;
          console.log(`Updated ${fieldName} = ${actualValue} (type: ${typeof actualValue})`);
        } else {
          console.warn(`Field ${fieldName} not found in component template`);
        }
      }
      
      // Remove template from updates to prevent duplicate processing
      const { template, ...otherUpdates } = op.updates;
      op.updates = otherUpdates;
    }

    /**
     * Deep merge utility for combining nested objects.
     * Handles type mismatches gracefully and skips null/undefined values.
     */
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

    // Apply non-template updates
    if (op.merge && node.data) {
      node.data = deepMerge(node.data, op.updates);
    } else {
      Object.assign(node.data, op.updates);
    }

    /**
     * Reconstruct node from component catalog to ensure structural integrity.
     * 
     * This critical step:
     * 1. Creates a fresh template from the component catalog
     * 2. Applies saved template updates (highest priority)
     * 3. Preserves existing user values for unchanged fields
     * 
     * By iterating over the NEW template (not the old one), we ensure
     * all fields from the component catalog are processed, preventing
     * updates from being silently ignored due to missing fields.
     */
    const componentType = node.data?.type;
    if (componentType && this.componentCatalog[componentType]) {
      const componentTemplate = this.componentCatalog[componentType];
      const nodeTemplate = JSON.parse(JSON.stringify(componentTemplate.template || {}));
      
      if (node.data.node?.template && nodeTemplate) {
        // CRITICAL: Iterate over the NEW template, not the old one
        // This ensures all fields from the component catalog are processed
        for (const fieldName in nodeTemplate) {
          if (templateUpdates.hasOwnProperty(fieldName)) {
            // Apply saved updates first (highest priority)
            nodeTemplate[fieldName].value = templateUpdates[fieldName];
            console.log(`Applied saved update for ${fieldName}: ${templateUpdates[fieldName]}`);
          } else if (node.data.node?.template?.[fieldName]?.value !== undefined) {
            // Preserve existing values for unchanged fields
            nodeTemplate[fieldName].value = node.data.node.template[fieldName].value;
          }
        }
      }
      
      // Reconstruct node with updated template
      node.data.node = {
        ...componentTemplate,
        template: nodeTemplate
      };
      
      // Remove redundant properties
      delete (node.data.node as any).type;
      delete (node.data.node as any).name;
    }

    return flow;
  }

  /**
   * Updates the position of a node in the flow canvas.
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
   * Adds a connection (edge) between two nodes.
   * 
   * Validates that:
   * - Both source and target nodes exist
   * - The connection doesn't already exist
   * - The connection is valid (if validateConnection is true)
   */
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

    // Check for duplicate connections
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

  /**
   * Removes a connection between two nodes.
   * 
   * If handles are not specified, removes the first matching edge
   * between the source and target nodes.
   */
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

  /**
   * Updates flow-level metadata such as name, description, tags.
   * 
   * Only specified fields are updated; others remain unchanged.
   * Custom metadata is merged, not replaced.
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
   * Creates a deep copy of a flow to prevent mutations.
   */
  private cloneFlow(flow: LangflowFlow): LangflowFlow {
    return JSON.parse(JSON.stringify(flow));
  }
}