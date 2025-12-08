import { FlowNode, FlowEdge } from '../types.js';

/**
 * Operations that can be applied to modify a Langflow flow structure.
 */
export type FlowDiffOperationType =
  | 'addNode'
  | 'removeNode'
  | 'updateNode'
  | 'moveNode'
  | 'addEdge'
  | 'removeEdge'
  | 'updateMetadata'
  | 'addNodes'      // Bulk add
  | 'removeNodes'   // Bulk remove
  | 'addEdges'      // Bulk add edges
  | 'removeEdges'   // Bulk remove edges
  | 'addNote';      // Add note/README

export interface BaseOperation {
  type: FlowDiffOperationType;
  description?: string;
}

/**
 * Adds a node using complete FlowNode structure.
 * Use for custom components, imports, or when you need full control.
 */
export interface AddFullNodeOperation extends BaseOperation {
  type: 'addNode';
  node: FlowNode;
  position?: { x: number; y: number };
}

/**
 * Adds a node using simplified schema (recommended).
 * Automatically constructs node from component catalog.
 */
export interface AddSimplifiedNodeOperation extends BaseOperation {
  type: 'addNode';
  nodeId: string;
  component: string;
  params?: Record<string, any>;
  position?: { x: number; y: number };
}

/**
 * Union of both node addition schemas.
 */
export type AddNodeOperation = AddFullNodeOperation | AddSimplifiedNodeOperation;

export interface RemoveNodeOperation extends BaseOperation {
  type: 'removeNode';
  nodeId: string;
  removeConnections?: boolean;
}

export interface UpdateNodeOperation {
  type: 'updateNode';
  nodeId: string;
  updates: {
    position?: { x: number; y: number };
    template?: Record<string, any>;
    displayName?: string;
    // Add support for nested data updates
    data?: {
      node?: {
        template?: Record<string, any>;
        [key: string]: any;
      };
      [key: string]: any;
    };
    [key: string]: any;  // Allow other properties
  };
  merge?: boolean;
}

export interface MoveNodeOperation extends BaseOperation {
  type: 'moveNode';
  nodeId: string;
  position: { x: number; y: number };
}

/**
 * Adds an edge using complete FlowEdge structure.
 * Use for imports or when you need precise handle control.
 */
export interface AddFullEdgeOperation extends BaseOperation {
  type: 'addEdge';
  edge: FlowEdge;
  validateConnection?: boolean;
}

/**
 * Adds an edge using simplified schema (recommended).
 * Automatically constructs handles from node metadata.
 */
export interface AddSimplifiedEdgeOperation extends BaseOperation {
  type: 'addEdge';
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  targetParam?: string;
  validateConnection?: boolean;
}

/**
 * Union of both edge addition schemas.
 */
export type AddEdgeOperation = AddFullEdgeOperation | AddSimplifiedEdgeOperation;

export interface RemoveEdgeOperation extends BaseOperation {
  type: 'removeEdge';
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface UpdateMetadataOperation extends BaseOperation {
  type: 'updateMetadata';
  updates: {
    name?: string;
    description?: string;
    tags?: string[];
    metadata?: Record<string, any>;
  };
}

/**
 * Bulk add multiple nodes in a single operation.
 * More efficient than multiple addNode operations.
 */
export interface AddNodesOperation extends BaseOperation {
  type: 'addNodes';
  nodes: Array<{
    nodeId: string;
    component: string;
    params?: Record<string, any>;
    position?: { x: number; y: number };
  }>;
  autoLayout?: 'horizontal' | 'vertical' | 'grid';
  spacing?: number;
}

/**
 * Bulk remove multiple nodes.
 */
export interface RemoveNodesOperation extends BaseOperation {
  type: 'removeNodes';
  nodeIds: string[];
  removeConnections?: boolean;
}

/**
 * Bulk add multiple edges.
 */
export interface AddEdgesOperation extends BaseOperation {
  type: 'addEdges';
  edges: Array<{
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    targetParam?: string;
  }>;
  validateConnections?: boolean;
}

/**
 * Bulk remove multiple edges.
 */
export interface RemoveEdgesOperation extends BaseOperation {
  type: 'removeEdges';
  edges: Array<{
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
  }>;
}

/**
 * Adds a markdown note/README to a flow for documentation.
 * Notes are special UI-only elements that don't connect to other nodes.
 */
export interface AddNoteOperation extends BaseOperation {
  type: 'addNote';
  noteId?: string;
  markdown: string;
  position?: { x: number; y: number };
  backgroundColor?: 'neutral' | 'transparent';
}

export type FlowDiffOperation =
  | AddNodeOperation
  | AddNoteOperation
  | RemoveNodeOperation
  | UpdateNodeOperation
  | MoveNodeOperation
  | AddEdgeOperation
  | RemoveEdgeOperation
  | UpdateMetadataOperation
  | AddNodesOperation
  | RemoveNodesOperation
  | AddEdgesOperation
  | RemoveEdgesOperation;

/**
 * Result of applying diff operations to a flow.
 */
export interface FlowDiffResult {
  success: boolean;
  flow?: any;
  operationsApplied: number;
  applied: number[];
  failed: number[];
  errors: string[];
  warnings: string[];
}

/**
 * Request to apply operations to a flow.
 */
export interface FlowDiffRequest {
  flowId?: string;
  flow?: any;
  operations: FlowDiffOperation[];
  validateAfter?: boolean;
  continueOnError?: boolean;
}