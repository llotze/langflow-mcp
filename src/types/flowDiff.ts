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
  | 'updateMetadata';

export interface BaseOperation {
  type: FlowDiffOperationType;
  description?: string;
}

export interface AddNodeOperation extends BaseOperation {
  type: 'addNode';
  node: FlowNode;
  position?: { x: number; y: number };
}

export interface RemoveNodeOperation extends BaseOperation {
  type: 'removeNode';
  nodeId: string;
  /** If true, also removes all edges connected to this node (default: true) */
  removeConnections?: boolean;
}

export interface UpdateNodeOperation extends BaseOperation {
  type: 'updateNode';
  nodeId: string;
  updates: {
    position?: { x: number; y: number };
    template?: Record<string, any>;
    displayName?: string;
  };
  /** If true, deep merges updates with existing data (default: false) */
  merge?: boolean;
}

export interface MoveNodeOperation extends BaseOperation {
  type: 'moveNode';
  nodeId: string;
  position: { x: number; y: number };
}

export interface AddEdgeOperation extends BaseOperation {
  type: 'addEdge';
  edge: FlowEdge;
  /** If true, validates connection compatibility (default: true) */
  validateConnection?: boolean;
}

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

export type FlowDiffOperation =
  | AddNodeOperation
  | RemoveNodeOperation
  | UpdateNodeOperation
  | MoveNodeOperation
  | AddEdgeOperation
  | RemoveEdgeOperation
  | UpdateMetadataOperation;

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
  /** Flow UUID to modify (mutually exclusive with flow) */
  flowId?: string;
  /** Flow object to modify (mutually exclusive with flowId) */
  flow?: any;
  operations: FlowDiffOperation[];
  /** Validate flow after operations (default: true) */
  validateAfter?: boolean;
  /** Continue on operation failure (default: false) */
  continueOnError?: boolean;
}