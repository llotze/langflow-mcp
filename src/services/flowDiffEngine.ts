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

    console.log("FlowDiffEngine.applyDiff: Input flow structure:", {
      hasFlow: !!request.flow,
      hasData: !!request.flow?.data,
      hasNodes: !!request.flow?.data?.nodes,
      nodesLength: request.flow?.data?.nodes?.length,
      nodesIsArray: Array.isArray(request.flow?.data?.nodes)
    });

    // Take snapshot for potential rollback
    const snapshot = this.cloneFlow(result.flow);
    console.log("Snapshot created before applying operations");

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
  private async buildNodeFromOperation(operation: any): Promise<FlowNode> {
    const { nodeId, component, params = {}, position = { x: 0, y: 0 } } = operation;
    
    // Validate required fields
    if (!nodeId || !component) {
      throw new Error('addNode requires nodeId and component fields');
    }
    
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
      type: 'genericNode',  // All nodes use genericNode as the React Flow type
      position,
      data: {
        id: nodeId,
        type: component,  // This is the Langflow component type
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
   * Adds a new node to the flow.
   * 
   * Now supports both:
   * 1. Full FlowNode objects (original behavior)
   * 2. Simplified schemas with nodeId, component, params (new)
   */
  private async applyAddNode(flow: LangflowFlow, op: any): Promise<LangflowFlow> {
    // Check if this is a simplified schema
    if (op.nodeId && op.component && !op.node) {
      // Build FlowNode from simplified schema
      op.node = await this.buildNodeFromOperation(op);
    }
    
    const { node, position } = op;

    // Validate node object
    if (!node || !node.id) {
      throw new Error('addNode requires a valid node object with an id field');
    }

    // Check for duplicate ID
    if (flow.data.nodes.some(n => n.id === node.id)) {
      throw new Error(`Node with ID "${node.id}" already exists`);
    }

    // Validate node structure
    if (!node.type) {
      throw new Error(`Node type is required for node "${node.id}"`);
    }
    
    if (!node.data) {
      throw new Error(`Node data is required for node "${node.id}"`);
    }
    
    if (!node.data.type) {
      throw new Error(`Node data.type (component type) is required for node "${node.id}"`);
    }

    // Apply position override if provided (for backward compatibility)
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
   * Supports two schemas:
   * 1. Simplified schema with source/target node IDs (recommended)
   * 2. Full FlowEdge object with complete handle specifications (advanced)
   * 
   * For simplified schemas, handles are constructed automatically using:
   * - Existing edges as templates (most reliable, copies proven handles)
   * - Node output/input metadata from component catalog (fallback)
   * - Langflow's custom JSON format with special character encoding
   * 
   * This hybrid approach maximizes reliability while maintaining flexibility
   * for complex edge configurations.
   */
  private applyAddEdge(flow: LangflowFlow, op: any): LangflowFlow {
    let edge: FlowEdge;

    // Check if this is a simplified schema
    if (op.source && op.target && !op.edge) {
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

    } else if (op.edge) {
      edge = op.edge;
    } else {
      throw new Error('addEdge requires either edge object or source/target fields');
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
   * If a simple handle name is provided, it's used to find the matching
   * output from the node's output definitions. Otherwise, the first or
   * selected output is used.
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

    // Get node outputs
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
      // Construct handle in Langflow's format
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
   * Target handles encode the destination parameter information including
   * field name, accepted input types, and parameter type. This metadata
   * enables Langflow's connection validation in the UI.
   * 
   * The handle is constructed from the node's template field definition,
   * ensuring type compatibility information is preserved.
   * 
   * @param targetNode - Target node with template definitions
   * @param targetParam - Parameter name to connect to
   * @returns Properly formatted handle string for Langflow
   */
  private constructTargetHandle(targetNode: FlowNode, targetParam: string): string {
    const template = targetNode.data?.node?.template;
    
    if (template && template[targetParam]) {
      const field = template[targetParam];
      // Construct handle in Langflow's format
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

  /**
   * Validates an operation before applying it.
   * 
   * Performs pre-flight checks including:
   * - Node and edge existence in the flow
   * - Component type validity against catalog
   * - Required field presence and correctness
   * - Type compatibility and structural requirements
   * 
   * Returns validation issues categorized by severity. Errors prevent
   * operation application, while warnings are informational.
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
        const op = operation as any;
        
        // Determine which schema is being used
        const nodeId = op.nodeId || op.node?.id;
        const componentType = op.component || op.node?.data?.type;
        
        if (!nodeId) {
          issues.push({
            severity: 'error',
            message: 'addNode requires either nodeId or node.id',
            fix: 'Set nodeId: "your-node-id" or provide a complete node object'
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

        // ✅ ONLY validate component catalog for simplified schema
        if (op.nodeId && op.component && !op.node) {
          // Simplified schema - check catalog
          if (!this.componentCatalog[op.component]) {
            issues.push({
              severity: 'error',
              nodeId,
              message: `Cannot add node: unknown component type "${op.component}"`,
              fix: 'Use search_components to find valid component names'
            });
          }
        } else if (op.nodeId && !op.component && !op.node) {
          // Simplified schema but missing component
          issues.push({
            severity: 'error',
            nodeId: op.nodeId,
            message: 'Simplified addNode requires both nodeId and component fields',
            fix: 'Add component: "ComponentName" to the operation'
          });
        } else if (op.node) {
          // ✅ Full node object - validate structure only
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
          // ✅ Don't check catalog - full node provides complete structure
        }
        
        break;
      }

      case 'updateNode': {
        const op = operation as UpdateNodeOperation;
        
        // Check node exists
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

        // Check component type exists in catalog
        const componentType = node.data?.type;
        if (componentType && !this.componentCatalog[componentType]) {
          issues.push({
            severity: 'error',
            nodeId: op.nodeId,
            message: `Node "${op.nodeId}" has unknown component type: "${componentType}"`,
            fix: 'This node uses a component not in the catalog'
          });
        }

        // Validate template updates
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
        
        // Check node exists
        if (!flow.data.nodes.some(n => n.id === op.nodeId)) {
          issues.push({
            severity: 'error',
            nodeId: op.nodeId,
            message: `Cannot remove node "${op.nodeId}": node not found`,
            fix: 'Check the node ID'
          });
          return issues;
        }

        // Check for dependent nodes (if not removing connections)
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
        const op = operation as any;
        
        // Determine which schema is being used
        const source = op.source || op.edge?.source;
        const target = op.target || op.edge?.target;
        
        if (!source || !target) {
          issues.push({
            severity: 'error',
            message: 'addEdge requires either edge object or source/target fields',
            fix: 'Set source: "node_id" and target: "node_id"'
          });
          break;
        }
        
        // Check source node exists
        if (!flow.data.nodes.some(n => n.id === source)) {
          issues.push({
            severity: 'error',
            message: `Cannot add edge: source node "${source}" not found`,
            fix: 'Add the source node first or fix the node ID'
          });
        }

        // Check target node exists
        if (!flow.data.nodes.some(n => n.id === target)) {
          issues.push({
            severity: 'error',
            message: `Cannot add edge: target node "${target}" not found`,
            fix: 'Add the target node first or fix the node ID'
          });
        }

        // Check for self-loop
        if (source === target) {
          issues.push({
            severity: 'error',
            message: `Cannot add edge: node "${source}" cannot connect to itself`,
            fix: 'Connect to a different node'
          });
        }

        // Check for duplicate edge (approximate check for simplified schema)
        const sourceHandle = op.sourceHandle || op.edge?.sourceHandle;
        const targetHandle = op.targetHandle || op.edge?.targetHandle;
        
        const duplicate = flow.data.edges.some(e =>
          e.source === source &&
          e.target === target &&
          (!sourceHandle || e.sourceHandle === sourceHandle) &&
          (!targetHandle || e.targetHandle === targetHandle)
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
        
        // Check edge exists
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
        
        // Check node exists
        if (!flow.data.nodes.some(n => n.id === op.nodeId)) {
          issues.push({
            severity: 'error',
            nodeId: op.nodeId,
            message: `Cannot move node "${op.nodeId}": node not found`,
            fix: 'Check the node ID'
          });
        }

        // Validate position
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
    }

    return issues;
  }
}