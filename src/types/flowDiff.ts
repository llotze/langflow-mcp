import { FlowNode, FlowEdge } from '../types.js';

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
  description?: string; // Human-readable explanation
}

export interface AddNodeOperation extends BaseOperation {
  type: 'addNode';
  node: FlowNode;
  position?: { x: number; y: number }; // Override node's position
}

export interface RemoveNodeOperation extends BaseOperation {
  type: 'removeNode';
  nodeId: string;
  removeConnections?: boolean; // Default: true
}

export interface UpdateNodeOperation extends BaseOperation {
  type: 'updateNode';
  nodeId: string;
  updates: {
    position?: { x: number; y: number };
    template?: Record<string, any>; // Partial template updates
    displayName?: string;
  };
  merge?: boolean; // Default: true (merge with existing, don't replace)
}

export interface MoveNodeOperation extends BaseOperation {
  type: 'moveNode';
  nodeId: string;
  position: { x: number; y: number };
}

export interface AddEdgeOperation extends BaseOperation {
  type: 'addEdge';
  edge: FlowEdge;
  validateConnection?: boolean; // Default: true
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

export interface FlowDiffResult {
  success: boolean;
  flow?: any; // Updated flow
  operationsApplied: number;
  applied: number[]; // Indices of successful operations
  failed: number[]; // Indices of failed operations
  errors: string[];
  warnings: string[];
}

export interface FlowDiffRequest {
  flowId?: string; // For retrieving existing flow
  flow?: any; // Or provide flow directly
  operations: FlowDiffOperation[];
  validateAfter?: boolean; // Default: true
  continueOnError?: boolean; // Default: false
}