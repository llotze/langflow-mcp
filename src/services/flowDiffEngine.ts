import { LangflowComponent, LangflowFlow, FlowNode, FlowEdge } from '../types.js';
import {
  FlowDiffOperation,
  FlowDiffRequest,
  FlowDiffResult,
  AddNodeOperation,
  AddSimplifiedNodeOperation,
  AddFullNodeOperation,
  RemoveNodeOperation,
  UpdateNodeOperation,
  MoveNodeOperation,
  AddEdgeOperation,
  AddSimplifiedEdgeOperation,
  AddFullEdgeOperation,
  RemoveEdgeOperation,
  UpdateMetadataOperation,
  AddNodesOperation,
  RemoveNodesOperation,
  AddEdgesOperation,
  RemoveEdgesOperation
} from '../types/flowDiff.js';
import { FlowValidator, ValidationResult } from './flowValidator.js';
import { FlowHistory } from './flowHistory.js';

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
    private validator: FlowValidator,
    private history?: FlowHistory  // Optional history tracking
  ) {}

  /**
   * Type guard to check if operation uses simplified node schema.
   */
  private isSimplifiedNodeOp(op: AddNodeOperation): op is AddSimplifiedNodeOperation {
    return 'nodeId' in op && 'component' in op;
  }

  /**
   * Type guard to check if operation uses full node schema.
   */
  private isFullNodeOp(op: AddNodeOperation): op is AddFullNodeOperation {
    return 'node' in op;
  }

  /**
   * Type guard to check if operation uses simplified edge schema.
   */
  private isSimplifiedEdgeOp(op: AddEdgeOperation): op is AddSimplifiedEdgeOperation {
    return 'source' in op && 'target' in op && !('edge' in op);
  }

  /**
   * Type guard to check if operation uses full edge schema.
   */
  private isFullEdgeOp(op: AddEdgeOperation): op is AddFullEdgeOperation {
    return 'edge' in op;
  }

  /**
   * Applies operations with pre-validation and rollback on failure.
   * 
   * Process:
   * 1. Take snapshot of current flow state
   * 2. Pre-validate all operations before applying any changes
   * 3. Apply operations sequentially if validation passes
   * 4. Validate final flow structure
   * 5. Rollback to snapshot if any errors occur
   * 
   * @param request - Diff request containing flow and operations to apply
   * @returns Result with updated flow or error details
   * 
   * This ensures atomic operation application - either all operations
   * succeed, or the flow remains unchanged. Pre-validation prevents
   * partial application of operation sequences.
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

    // CAPTURE BEFORE STATE
    const beforeState = this.cloneFlow(result.flow);
    const snapshot = this.cloneFlow(result.flow);

    try {
      // Pre-validate all operations before applying any changes
      console.log(`Validating ${request.operations.length} operations...`);

      for (let i = 0; i < request.operations.length; i++) {
        const operation = request.operations[i];
        const issues = await this.validateOperation(operation, result.flow);
        
        // Collect errors and warnings
        const errors = issues.filter(issue => issue.severity === 'error');
        const warnings = issues.filter(issue => issue.severity === 'warning');

        if (errors.length > 0) {
          result.errors.push(
            `Operation ${i} (${operation.type}) validation failed:`,
            ...errors.map(e => `  - ${e.message}`)
          );
          result.failed.push(i);
        }

        if (warnings.length > 0) {
          result.warnings.push(
            `Operation ${i} (${operation.type}) warnings:`,
            ...warnings.map(w => `  - ${w.message}`)
          );
        }
      }

      // Abort if any validation errors occurred
      if (result.errors.length > 0) {
        console.log(`Pre-validation failed: ${result.errors.length} errors found`);
        return {
          ...result,
          success: false,
          flow: snapshot,
        };
      }

      console.log("Pre-validation passed, applying operations...");

      // Apply operations sequentially
      for (let i = 0; i < request.operations.length; i++) {
        const operation = request.operations[i];
        
        try {
          result.flow = await this.applyOperation(result.flow, operation);
          result.operationsApplied++;
          result.applied.push(i);
          console.log(`Applied operation ${i} (${operation.type})`);
        } catch (error: any) {
          result.failed.push(i);
          result.errors.push(
            `Operation ${i} (${operation.type}) failed: ${error.message}`
          );
          
          // Rollback on error
          console.log(`Operation ${i} failed, rolling back...`);
          result.flow = snapshot;
          result.success = false;
          
          if (!request.continueOnError) {
            return result;
          }
        }
      }

      // Post-validation of final flow structure
      if (request.validateAfter !== false && result.success) {
        console.log("Validating final flow structure...");
        const validation = await this.validator.validateFlow(result.flow);
        
        if (!validation.valid) {
          console.log("Post-validation failed, rolling back...");
          result.success = false;
          result.errors.push(
            `Flow validation failed after applying operations:`,
            ...validation.issues
              .filter(i => i.severity === 'error')
              .map(i => `  - ${i.message}`)
          );
          
          // Rollback to snapshot
          result.flow = snapshot;
          return result;
        }
        
        validation.issues
          .filter(i => i.severity === 'warning')
          .forEach(i => result.warnings.push(i.message));
        
        console.log("Post-validation passed");
      }

      console.log("FlowDiffEngine.applyDiff: Output flow structure:", {
        hasFlow: !!result.flow,
        hasData: !!result.flow?.data,
        hasNodes: !!result.flow?.data?.nodes,
        nodesLength: result.flow?.data?.nodes?.length,
        nodesIsArray: Array.isArray(result.flow?.data?.nodes)
      });

      // RECORD HISTORY ENTRY (only if operations were successful)
      if (this.history && result.success && result.operationsApplied > 0) {
        const flowId = request.flow?.id || request.flowId || 'unknown';
        
        this.history.push(
          flowId,
          beforeState,
          result.flow,
          request.operations.filter((_, idx) => result.applied.includes(idx)),
          `Applied ${result.operationsApplied} operations`,
          'mcp-client'
        );
      }

      return result;

    } catch (error: any) {
      // Catch-all rollback for unexpected errors
      console.log(`Unexpected error, rolling back: ${error.message}`);
      return {
        ...result,
        success: false,
        flow: snapshot,
        errors: [`Unexpected error: ${error.message}`],
      };
    }
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
      
      // Bulk operations
      case 'addNodes':
        return this.applyAddNodes(flow, operation);
      case 'removeNodes':
        return this.applyRemoveNodes(flow, operation);
      case 'addEdges':
        return this.applyAddEdges(flow, operation);
      case 'removeEdges':
        return this.applyRemoveEdges(flow, operation);
      
      case 'addNote': {
        const noteId = operation.noteId || `note-${Date.now()}`;
        
        const noteNode: FlowNode = {
          id: noteId,
          type: 'noteNode',
          position: operation.position || { x: 100, y: 100 },
          data: {
            id: noteId,
            type: 'note',
            node: {
              description: operation.markdown,
              display_name: '',
              documentation: '',
              template: {
                backgroundColor: operation.backgroundColor || 'neutral'
              }
            }
          }
        };

        flow.data.nodes.push(noteNode);
        return flow;
      }
      
      default:
        throw new Error(`Unknown operation type: ${(operation as any).type}`);
    }
  }

  /**
   * Constructs a complete FlowNode from simplified operation parameters.
   * 
   * Retrieves component template from catalog and applies user parameters.
   * This allows users to specify nodes using simple schemas rather than
   * manually constructing full FlowNode objects.
   * 
   * @param operation - Simplified addNode operation with component name and params
   * @returns Complete FlowNode ready for insertion into flow
   */
  private async buildNodeFromOperation(operation: AddSimplifiedNodeOperation): Promise<FlowNode> {
    const { nodeId, component, params = {}, position = { x: 0, y: 0 } } = operation;
    
    // Get component template from catalog
    const componentDef = this.componentCatalog[component];
    if (!componentDef) {
      throw new Error(`Unknown component type: "${component}"`);
    }
    
    // Clone template to avoid mutating catalog
    const template = JSON.parse(JSON.stringify(componentDef.template || {}));
    
    // Apply user-provided parameter values
    for (const [paramName, paramValue] of Object.entries(params)) {
      if (template[paramName]) {
        template[paramName].value = paramValue;
      } else {
        console.warn(`Parameter "${paramName}" not found in ${component} template`);
      }
    }
    
    // Construct complete FlowNode matching Langflow's structure
    const node: FlowNode = {
      id: nodeId,
      type: 'genericNode',
      position,
      data: {
        id: nodeId,
        type: component,
        node: {
          template,
          display_name: componentDef.display_name || component,
          description: componentDef.description || '',
          base_classes: componentDef.base_classes || [],
          outputs: componentDef.outputs || [],
          icon: componentDef.icon,
          beta: componentDef.beta,
          legacy: componentDef.legacy,
          frozen: componentDef.frozen,
        }
      },
      measured: { height: 234, width: 320 },
      width: 320,
      height: 234,
      selected: false,
      dragging: false,
    };
    
    return node;
  }

  /**
   * Adds a new node to the flow with full type safety.
   * 
   * Supports both simplified and full schemas via type guards.
   * Simplified schema automatically constructs node from catalog.
   * Full schema uses provided node object directly.
   */
  private async applyAddNode(
    flow: LangflowFlow, 
    op: AddNodeOperation
  ): Promise<LangflowFlow> {
    let node: FlowNode;
    let position: { x: number; y: number } | undefined;

    // Use type guards to determine schema and get proper typing
    if (this.isSimplifiedNodeOp(op)) {
      // TypeScript now knows op has nodeId, component, params
      node = await this.buildNodeFromOperation(op);
      position = op.position;
    } else if (this.isFullNodeOp(op)) {
      // TypeScript now knows op has node
      node = op.node;
      position = op.position;
    } else {
      throw new Error('addNode requires either full node object or simplified schema (nodeId + component)');
    }

    // Validate node structure
    if (!node.id) {
      throw new Error('Node must have an id field');
    }

    // Check for duplicate ID
    if (flow.data.nodes.some(n => n.id === node.id)) {
      throw new Error(`Node with ID "${node.id}" already exists`);
    }

    if (!node.type) {
      throw new Error(`Node type is required for node "${node.id}"`);
    }
    
    if (!node.data) {
      throw new Error(`Node data is required for node "${node.id}"`);
    }
    
    if (!node.data.type) {
      throw new Error(`Node data.type (component type) is required for node "${node.id}"`);
    }

    // Apply position override if provided
    const newNode = { ...node };
    if (position && position.x !== undefined && position.y !== undefined) {
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
          // Unwrap nested value objects
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
      
      // Remove template from updates to prevent duplicate processing
      const { template, ...otherUpdates } = op.updates;
      op.updates = otherUpdates;
    }

    /**
     * Deep merge utility for combining nested objects.
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

    // Reconstruct node from component catalog
    const componentType = node.data?.type;
    if (componentType && this.componentCatalog[componentType]) {
      const componentTemplate = this.componentCatalog[componentType];
      const nodeTemplate = JSON.parse(JSON.stringify(componentTemplate.template || {}));
      
      if (node.data.node?.template && nodeTemplate) {
        // Iterate over the NEW template to ensure all fields are processed
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
   * Adds a connection (edge) between two nodes with full type safety.
   * 
   * Supports both simplified and full schemas via type guards.
   * Simplified schema automatically constructs handles using hybrid strategy.
   * Full schema uses provided edge object directly.
   */
  private applyAddEdge(
    flow: LangflowFlow, 
    op: AddEdgeOperation
  ): LangflowFlow {
    let edge: FlowEdge;

    // Use type guards to determine schema and get proper typing
    if (this.isSimplifiedEdgeOp(op)) {
      // TypeScript now knows op has source, target, etc.
      const sourceNode = flow.data.nodes.find((n: FlowNode) => n.id === op.source);
      const targetNode = flow.data.nodes.find((n: FlowNode) => n.id === op.target);
      
      if (!sourceNode) {
        throw new Error(`Source node "${op.source}" not found`);
      }
      if (!targetNode) {
        throw new Error(`Target node "${op.target}" not found`);
      }

      let sourceHandle: string;
      let targetHandle: string;

      // Strategy 1: Copy handles from existing edges
      const existingSourceEdge = flow.data.edges.find(e => e.source === op.source);
      const existingTargetEdge = flow.data.edges.find(e => 
        e.target === op.target && 
        (!op.targetParam || (e.targetHandle && e.targetHandle.includes(op.targetParam)))
      );

      if (existingSourceEdge && existingSourceEdge.sourceHandle) {
        sourceHandle = existingSourceEdge.sourceHandle;
        console.log(`Copied source handle from existing edge`);
      } else {
        // Strategy 2: Construct new source handle from node metadata
        sourceHandle = this.constructSourceHandle(sourceNode, op.sourceHandle);
        console.log(`Constructed new source handle`);
      }

      if (existingTargetEdge && existingTargetEdge.targetHandle && op.targetParam) {
        targetHandle = existingTargetEdge.targetHandle;
        console.log(`Copied target handle from existing edge`);
      } else {
        // Strategy 2: Construct new target handle from node template
        targetHandle = this.constructTargetHandle(targetNode, op.targetParam || 'input_value');
        console.log(`Constructed new target handle`);
      }

      // Generate ReactFlow-compatible edge ID
      const edgeId = `reactflow__edge-${op.source}-${op.target}`;

      // Parse handle metadata for Langflow compatibility
      let parsedSourceHandle: any = undefined;
      let parsedTargetHandle: any = undefined;

      try {
        if (sourceHandle.startsWith('{') || sourceHandle.includes('œ')) {
          parsedSourceHandle = JSON.parse(sourceHandle.replace(/œ/g, '"'));
        }
        if (targetHandle.startsWith('{') || targetHandle.includes('œ')) {
          parsedTargetHandle = JSON.parse(targetHandle.replace(/œ/g, '"'));
        }
      } catch (err) {
        console.warn('Could not parse handle metadata, using as-is');
      }

      edge = {
        source: op.source,
        target: op.target,
        sourceHandle,
        targetHandle,
        id: edgeId,
        className: '',
        animated: false,
        selected: false,
        data: {
          sourceHandle: parsedSourceHandle,
          targetHandle: parsedTargetHandle
        }
      };

    } else if (this.isFullEdgeOp(op)) {
      // TypeScript now knows op has edge
      edge = op.edge;
    } else {
      throw new Error('addEdge requires either full edge object or simplified schema (source + target)');
    }

    // Validate source and target exist
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
        e.targetHandle === edge.targetHandle
    );

    if (duplicate) {
      console.warn(`Edge from "${edge.source}" to "${edge.target}" already exists, skipping`);
      return flow;
    }

    flow.data.edges.push(edge);
    return flow;
  }

  /**
   * Constructs source handle in Langflow's custom format.
   * 
   * Handles are encoded as JSON strings with special character replacement
   * (double quotes become "œ"). The handle contains metadata about the
   * source node's output including data type, output name, and type compatibility.
   * 
   * @param sourceNode - Source node with output definitions
   * @param providedHandle - Optional output name or pre-formatted handle
   * @returns Properly formatted handle string for Langflow
   */
  private constructSourceHandle(sourceNode: FlowNode, providedHandle?: string): string {
    // Only use provided handle if already in Langflow format
    if (providedHandle && (providedHandle.startsWith('{') || providedHandle.includes('œ'))) {
      return providedHandle;
    }

    const outputs = sourceNode.data?.node?.outputs || [];
    
    // If providedHandle is a simple name, find matching output
    let selectedOutput;
    if (providedHandle) {
      selectedOutput = outputs.find((out: any) => out.name === providedHandle);
    }
    
    // Fallback to selected or first output
    if (!selectedOutput) {
      selectedOutput = outputs.find((out: any) => 
        out.selected || out.name === sourceNode.data?.selected_output
      ) || outputs[0];
    }
    
    if (selectedOutput && selectedOutput.name) {
      return JSON.stringify({
        dataType: sourceNode.data?.type,
        id: sourceNode.id,
        name: selectedOutput.name,
        output_types: selectedOutput.types || ['Message']
      }).replace(/"/g, 'œ');
    }
    
    // Fallback: construct with provided name or default
    const outputName = providedHandle || 'output';
    return JSON.stringify({
      dataType: sourceNode.data?.type,
      id: sourceNode.id,
      name: outputName,
      output_types: ['Message']
    }).replace(/"/g, 'œ');
  }

  /**
   * Constructs target handle in Langflow's custom format.
   * 
   * @param targetNode - Target node with template definitions
   * @param targetParam - Parameter name to connect to
   * @returns Properly formatted handle string for Langflow
   */
  private constructTargetHandle(targetNode: FlowNode, targetParam: string): string {
    const template = targetNode.data?.node?.template;
    
    if (template && template[targetParam]) {
      const field = template[targetParam];
      return JSON.stringify({
        fieldName: targetParam,
        id: targetNode.id,
        inputTypes: field.input_types || field._input_types || ['Message'],
        type: field.type || 'str'
      }).replace(/"/g, 'œ');
    }
    
    // Fallback uses Langflow format with default types
    return JSON.stringify({
      fieldName: targetParam,
      id: targetNode.id,
      inputTypes: ['Message'],
      type: 'str'
    }).replace(/"/g, 'œ');
  }

  /**
   * Removes a connection between two nodes.
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
   * Updates flow-level metadata.
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

  /**
   * Validates an operation before applying it.
   * 
   * @param operation - Operation to validate
   * @param flow - Current flow state
   * @returns Array of validation issues
   */
  private async validateOperation(
    operation: FlowDiffOperation,
    flow: LangflowFlow
  ): Promise<Array<{ severity: 'error' | 'warning'; message: string; nodeId?: string; fix?: string }>> {
    const issues: Array<{ severity: 'error' | 'warning'; message: string; nodeId?: string; fix?: string }> = [];

    switch (operation.type) {
      case 'addNode': {
        const op = operation as AddNodeOperation;
        
        let nodeId: string;
        let componentType: string | undefined;
        
        if (this.isSimplifiedNodeOp(op)) {
          nodeId = op.nodeId;
          componentType = op.component;
          
          // Validate component exists in catalog
          if (!this.componentCatalog[op.component]) {
            issues.push({
              severity: 'error',
              nodeId,
              message: `Cannot add node: unknown component type "${op.component}"`,
              fix: 'Use search_components to find valid component names'
            });
          }
        } else if (this.isFullNodeOp(op)) {
          nodeId = op.node.id;
          componentType = op.node.data?.type;
          
          // Validate full node structure
          if (!op.node.type) {
            issues.push({
              severity: 'error',
              nodeId,
              message: 'Full node object requires type field',
              fix: 'Set type: "genericNode"'
            });
          }
          if (!op.node.data) {
            issues.push({
              severity: 'error',
              nodeId,
              message: 'Full node object requires data field',
              fix: 'Add data: { type: "ComponentName", node: { template: {...} } }'
            });
          }
          if (op.node.data && !op.node.data.type) {
            issues.push({
              severity: 'error',
              nodeId,
              message: 'Full node object requires data.type field',
              fix: 'Add data: { type: "ComponentName", ... }'
            });
          }
        } else {
          issues.push({
            severity: 'error',
            message: 'addNode requires either nodeId+component or complete node object',
            fix: 'Provide nodeId and component, or a full FlowNode object'
          });
          break;
        }
        
        // Check for duplicate ID
        if (flow.data.nodes.some(n => n.id === nodeId)) {
          issues.push({
            severity: 'error',
            nodeId,
            message: `Cannot add node: ID "${nodeId}" already exists`,
            fix: 'Use a unique node ID'
          });
        }
        
        break;
      }

      case 'updateNode': {
        const op = operation as UpdateNodeOperation;
        
        const node = flow.data.nodes.find(n => n.id === op.nodeId);
        if (!node) {
          issues.push({
            severity: 'error',
            nodeId: op.nodeId,
            message: `Cannot update node "${op.nodeId}": node not found`,
            fix: 'Check the node ID or use get_flow_details to see available nodes'
          });
          return issues;
        }

        const componentType = node.data?.type;
        if (componentType && !this.componentCatalog[componentType]) {
          issues.push({
            severity: 'error',
            nodeId: op.nodeId,
            message: `Node "${op.nodeId}" has unknown component type: "${componentType}"`,
            fix: 'This node uses a component not in the catalog'
          });
        }

        if (op.updates.template && componentType && this.componentCatalog[componentType]) {
          const component = this.componentCatalog[componentType];
          const validFields = new Set(Object.keys(component.template || {}));

          for (const fieldName of Object.keys(op.updates.template)) {
            if (!validFields.has(fieldName)) {
              issues.push({
                severity: 'warning',
                nodeId: op.nodeId,
                message: `Unknown parameter "${fieldName}" for ${componentType}`,
                fix: `Valid parameters: ${Array.from(validFields).join(', ')}`
              });
            }
          }
        }
        break;
      }

      case 'removeNode': {
        const op = operation as RemoveNodeOperation;
        
        if (!flow.data.nodes.some(n => n.id === op.nodeId)) {
          issues.push({
            severity: 'error',
            nodeId: op.nodeId,
            message: `Cannot remove node "${op.nodeId}": node not found`,
            fix: 'Check the node ID'
          });
          return issues;
        }

        if (!op.removeConnections) {
          const dependents = flow.data.edges.filter(e => e.source === op.nodeId);
          if (dependents.length > 0) {
            const targetNodes = dependents.map(e => e.target).join(', ');
            issues.push({
              severity: 'error',
              nodeId: op.nodeId,
              message: `Cannot remove node "${op.nodeId}": ${dependents.length} nodes depend on it (${targetNodes})`,
              fix: 'Set removeConnections: true or remove dependent nodes first'
            });
          }
        }
        break;
      }

      case 'addEdge': {
        const op = operation as AddEdgeOperation;
        
        let source: string;
        let target: string;
        
        if (this.isSimplifiedEdgeOp(op)) {
          source = op.source;
          target = op.target;
        } else if (this.isFullEdgeOp(op)) {
          source = op.edge.source;
          target = op.edge.target;
        } else {
          issues.push({
            severity: 'error',
            message: 'addEdge requires either source+target or complete edge object',
            fix: 'Provide source and target node IDs, or a full FlowEdge object'
          });
          break;
        }
        
        if (!flow.data.nodes.some(n => n.id === source)) {
          issues.push({
            severity: 'error',
            message: `Cannot add edge: source node "${source}" not found`,
            fix: 'Add the source node first or fix the node ID'
          });
        }

        if (!flow.data.nodes.some(n => n.id === target)) {
          issues.push({
            severity: 'error',
            message: `Cannot add edge: target node "${target}" not found`,
            fix: 'Add the target node first or fix the node ID'
          });
        }

        if (source === target) {
          issues.push({
            severity: 'error',
            message: `Cannot add edge: node "${source}" cannot connect to itself`,
            fix: 'Connect to a different node'
          });
        }

        const duplicate = flow.data.edges.some(e =>
          e.source === source &&
          e.target === target
        );
        
        if (duplicate) {
          issues.push({
            severity: 'warning',
            message: `Edge from "${source}" to "${target}" may already exist`,
            fix: 'Check existing connections'
          });
        }
        break;
      }

      case 'removeEdge': {
        const op = operation as RemoveEdgeOperation;
        
        const edgeExists = flow.data.edges.some(e =>
          e.source === op.source &&
          e.target === op.target &&
          (op.sourceHandle === undefined || e.sourceHandle === op.sourceHandle) &&
          (op.targetHandle === undefined || e.targetHandle === op.targetHandle)
        );

        if (!edgeExists) {
          issues.push({
            severity: 'error',
            message: `Cannot remove edge: no edge from "${op.source}" to "${op.target}"`,
            fix: 'Check the source and target node IDs'
          });
        }
        break;
      }

      case 'moveNode': {
        const op = operation as MoveNodeOperation;
        
        if (!flow.data.nodes.some(n => n.id === op.nodeId)) {
          issues.push({
            severity: 'error',
            nodeId: op.nodeId,
            message: `Cannot move node "${op.nodeId}": node not found`,
            fix: 'Check the node ID'
          });
        }

        if (typeof op.position.x !== 'number' || typeof op.position.y !== 'number') {
          issues.push({
            severity: 'error',
            nodeId: op.nodeId,
            message: 'Invalid position: x and y must be numbers',
            fix: 'Set position: { x: 100, y: 200 }'
          });
        }
        break;
      }

      case 'updateMetadata': {
        // Metadata updates are always valid
        break;
      }

      case 'addNodes': {
        const op = operation as AddNodesOperation;
        
        if (!op.nodes || op.nodes.length === 0) {
          issues.push({
            severity: 'error',
            message: 'addNodes operation requires at least one node specification',
            fix: 'Provide nodes array with at least one node'
          });
          break;
        }

        for (const nodeSpec of op.nodes) {
          if (!nodeSpec.nodeId) {
            issues.push({
              severity: 'error',
              message: 'Each node in addNodes must have a nodeId',
              fix: 'Add nodeId field to all nodes'
            });
            continue;
          }

          if (!nodeSpec.component) {
            issues.push({
              severity: 'error',
              nodeId: nodeSpec.nodeId,
              message: `Node ${nodeSpec.nodeId} missing component type`,
              fix: 'Add component field'
            });
            continue;
          }

          if (!this.componentCatalog[nodeSpec.component]) {
            issues.push({
              severity: 'error',
              nodeId: nodeSpec.nodeId,
              message: `Unknown component type: ${nodeSpec.component}`,
              fix: 'Use search_components to find valid component names'
            });
          }

          if (flow.data.nodes.some(n => n.id === nodeSpec.nodeId)) {
            issues.push({
              severity: 'error',
              nodeId: nodeSpec.nodeId,
              message: `Node ID ${nodeSpec.nodeId} already exists`,
              fix: 'Use unique node IDs'
            });
          }
        }
        break;
      }

      case 'removeNodes': {
        const op = operation as RemoveNodesOperation;
        
        if (!op.nodeIds || op.nodeIds.length === 0) {
          issues.push({
            severity: 'error',
            message: 'removeNodes operation requires at least one nodeId',
            fix: 'Provide nodeIds array'
          });
          break;
        }

        const missingNodes = op.nodeIds.filter(
          id => !flow.data.nodes.some(n => n.id === id)
        );

        if (missingNodes.length > 0) {
          issues.push({
            severity: 'error',
            message: `Nodes not found: ${missingNodes.join(', ')}`,
            fix: 'Check node IDs or use get_flow_details'
          });
        }

        if (!op.removeConnections) {
          for (const nodeId of op.nodeIds) {
            const dependents = flow.data.edges.filter(e => e.source === nodeId);
            if (dependents.length > 0) {
              const targetNodes = dependents.map(e => e.target).join(', ');
              issues.push({
                severity: 'error',
                nodeId,
                message: `Node ${nodeId} has ${dependents.length} dependent connections (${targetNodes})`,
                fix: 'Set removeConnections: true or remove dependents first'
              });
            }
          }
        }
        break;
      }

      case 'addEdges': {
        const op = operation as AddEdgesOperation;
        
        if (!op.edges || op.edges.length === 0) {
          issues.push({
            severity: 'error',
            message: 'addEdges operation requires at least one edge specification',
            fix: 'Provide edges array'
          });
          break;
        }

        for (const edgeSpec of op.edges) {
          if (!edgeSpec.source) {
            issues.push({
              severity: 'error',
              message: 'Each edge must have a source',
              fix: 'Add source field to all edges'
            });
            continue;
          }

          if (!edgeSpec.target) {
            issues.push({
              severity: 'error',
              message: 'Each edge must have a target',
              fix: 'Add target field to all edges'
            });
            continue;
          }

          if (!flow.data.nodes.some(n => n.id === edgeSpec.source)) {
            issues.push({
              severity: 'error',
              message: `Source node not found: ${edgeSpec.source}`,
              fix: 'Add source node first'
            });
          }

          if (!flow.data.nodes.some(n => n.id === edgeSpec.target)) {
            issues.push({
              severity: 'error',
              message: `Target node not found: ${edgeSpec.target}`,
              fix: 'Add target node first'
            });
          }

          if (edgeSpec.source === edgeSpec.target) {
            issues.push({
              severity: 'error',
              message: `Node ${edgeSpec.source} cannot connect to itself`,
              fix: 'Use different source and target'
            });
          }
        }
        break;
      }

      case 'removeEdges': {
        const op = operation as RemoveEdgesOperation;
        
        if (!op.edges || op.edges.length === 0) {
          issues.push({
            severity: 'error',
            message: 'removeEdges operation requires at least one edge specification',
            fix: 'Provide edges array'
          });
          break;
        }

        for (const edgeSpec of op.edges) {
          if (!edgeSpec.source || !edgeSpec.target) {
            issues.push({
              severity: 'error',
              message: 'Each edge must have source and target',
              fix: 'Add source and target fields'
            });
            continue;
          }

          const edgeExists = flow.data.edges.some(e =>
            e.source === edgeSpec.source &&
            e.target === edgeSpec.target
          );

          if (!edgeExists) {
            issues.push({
              severity: 'warning',
              message: `No edge from ${edgeSpec.source} to ${edgeSpec.target}`,
              fix: 'Check source and target IDs'
            });
          }
        }
        break;
      }
    }

    return issues;
  }

  /**
   * Bulk adds multiple nodes with automatic layout.
   * 
   * @param flow - Current flow state
   * @param op - Bulk add operation
   * @returns Updated flow with all nodes added
   * 
   * Benefits:
   * - Single validation pass for all nodes
   * - Automatic layout positioning
   * - Better performance than multiple addNode calls
   */
  private async applyAddNodes(
    flow: LangflowFlow,
    op: AddNodesOperation
  ): Promise<LangflowFlow> {
    const { nodes, autoLayout = 'horizontal', spacing = 350 } = op;

    if (!nodes || nodes.length === 0) {
      throw new Error('addNodes operation requires at least one node');
    }

    // Calculate positions based on layout strategy
    const positions = this.calculateBulkLayout(nodes.length, autoLayout, spacing);

    // Build all nodes in parallel for performance
    const nodePromises = nodes.map(async (nodeSpec, index) => {
      const position = nodeSpec.position || positions[index];
      return this.buildNodeFromOperation({
        type: 'addNode',
        nodeId: nodeSpec.nodeId,
        component: nodeSpec.component,
        params: nodeSpec.params,
        position
      });
    });

    const newNodes = await Promise.all(nodePromises);

    // Validate all nodes before adding any
    for (const node of newNodes) {
      if (flow.data.nodes.some(n => n.id === node.id)) {
        throw new Error(`Duplicate node ID: ${node.id}`);
      }
    }

    // Add all nodes
    flow.data.nodes.push(...newNodes);

    return flow;
  }

  /**
   * Bulk removes multiple nodes.
   * 
   * @param flow - Current flow state
   * @param op - Bulk remove operation
   * @returns Updated flow with nodes removed
   */
  private applyRemoveNodes(
    flow: LangflowFlow,
    op: RemoveNodesOperation
  ): LangflowFlow {
    const { nodeIds, removeConnections = true } = op;

    if (!nodeIds || nodeIds.length === 0) {
      throw new Error('removeNodes operation requires at least one nodeId');
    }

    // Validate all nodes exist
    const missingNodes = nodeIds.filter(
      id => !flow.data.nodes.some(n => n.id === id)
    );

    if (missingNodes.length > 0) {
      throw new Error(`Nodes not found: ${missingNodes.join(', ')}`);
    }

    // Remove nodes
    flow.data.nodes = flow.data.nodes.filter(
      n => !nodeIds.includes(n.id)
    );

    // Remove connected edges if requested
    if (removeConnections) {
      flow.data.edges = flow.data.edges.filter(
        e => !nodeIds.includes(e.source) && !nodeIds.includes(e.target)
      );
    }

    return flow;
  }

  /**
   * Bulk adds multiple edges.
   * 
   * @param flow - Current flow state
   * @param op - Bulk add edges operation
   * @returns Updated flow with edges added
   */
  private async applyAddEdges(
    flow: LangflowFlow,
    op: AddEdgesOperation
  ): Promise<LangflowFlow> {
    const { edges, validateConnections = true } = op;

    if (!edges || edges.length === 0) {
      throw new Error('addEdges operation requires at least one edge');
    }

    // Validate all source/target nodes exist
    if (validateConnections) {
      for (const edgeSpec of edges) {
        const sourceExists = flow.data.nodes.some(n => n.id === edgeSpec.source);
        const targetExists = flow.data.nodes.some(n => n.id === edgeSpec.target);

        if (!sourceExists) {
          throw new Error(`Source node not found: ${edgeSpec.source}`);
        }
        if (!targetExists) {
          throw new Error(`Target node not found: ${edgeSpec.target}`);
        }
      }
    }

    // Build all edges
    const newEdges: FlowEdge[] = [];
    for (const edgeSpec of edges) {
      const sourceNode = flow.data.nodes.find(n => n.id === edgeSpec.source)!;
      const targetNode = flow.data.nodes.find(n => n.id === edgeSpec.target)!;

      const sourceHandle = edgeSpec.sourceHandle || 
        this.constructSourceHandle(sourceNode);
      const targetHandle = edgeSpec.targetHandle || 
        this.constructTargetHandle(targetNode, edgeSpec.targetParam || 'input_value');

      const edge: FlowEdge = {
        id: `reactflow__edge-${edgeSpec.source}${sourceHandle}-${edgeSpec.target}${targetHandle}`,
        source: edgeSpec.source,
        target: edgeSpec.target,
        sourceHandle,
        targetHandle,
        data: {
          sourceHandle: JSON.parse(sourceHandle.replace(/œ/g, '"')),
          targetHandle: JSON.parse(targetHandle.replace(/œ/g, '"'))
        },
        animated: false,
        selected: false,
        className: ''
      };

      // Check for duplicates
      const duplicate = flow.data.edges.some(
        e => e.source === edge.source && 
             e.target === edge.target && 
             e.targetHandle === edge.targetHandle
      );

      if (!duplicate) {
        newEdges.push(edge);
      }
    }

    flow.data.edges.push(...newEdges);
    return flow;
  }

  /**
   * Bulk removes multiple edges.
   * 
   * @param flow - Current flow state
   * @param op - Bulk remove edges operation
   * @returns Updated flow with edges removed
   */
  private applyRemoveEdges(
    flow: LangflowFlow,
    op: RemoveEdgesOperation
  ): LangflowFlow {
    const { edges } = op;

    if (!edges || edges.length === 0) {
      throw new Error('removeEdges operation requires at least one edge');
    }

    // Remove matching edges
    for (const edgeSpec of edges) {
      flow.data.edges = flow.data.edges.filter(e => {
        const matchesSourceTarget = e.source === edgeSpec.source && 
                                   e.target === edgeSpec.target;
        
        if (!matchesSourceTarget) return true;

        // If handles specified, must match both
        if (edgeSpec.sourceHandle && edgeSpec.targetHandle) {
          return e.sourceHandle !== edgeSpec.sourceHandle || 
                 e.targetHandle !== edgeSpec.targetHandle;
        }

        // Otherwise remove all edges between these nodes
        return false;
      });
    }

    return flow;
  }

  /**
   * Calculates node positions for bulk layout.
   * 
   * @param count - Number of nodes to position
   * @param layout - Layout strategy
   * @param spacing - Space between nodes
   * @returns Array of positions
   */
  private calculateBulkLayout(
    count: number,
    layout: 'horizontal' | 'vertical' | 'grid',
    spacing: number
  ): Array<{ x: number; y: number }> {
    const positions: Array<{ x: number; y: number }> = [];

    switch (layout) {
      case 'horizontal':
        for (let i = 0; i < count; i++) {
          positions.push({
            x: 100 + (i * spacing),
            y: 200
          });
        }
        break;

      case 'vertical':
        for (let i = 0; i < count; i++) {
          positions.push({
            x: 100,
            y: 100 + (i * spacing)
          });
        }
        break;

      case 'grid':
        const columns = Math.ceil(Math.sqrt(count));
        for (let i = 0; i < count; i++) {
          const row = Math.floor(i / columns);
          const col = i % columns;
          positions.push({
            x: 100 + (col * spacing),
            y: 100 + (row * spacing)
          });
        }
        break;
    }

    return positions;
  }
}