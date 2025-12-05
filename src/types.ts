import type { Node, Edge } from '@xyflow/react';

/**
 * Langflow flow node extending ReactFlow's Node type.
 * Contains component template, metadata, and display properties.
 */
export type FlowNode = Node<{
  id?: string;
  type: string;
  node: {
    template: Record<string, any>;
    display_name?: string;
    description?: string;
    base_classes?: string[];
    outputs?: any[];
    icon?: string;
    beta?: boolean;
    legacy?: boolean;
    frozen?: boolean;
    tool_mode?: boolean;
    edited?: boolean;
    pinned?: boolean;
    minimized?: boolean;
    field_order?: string[];
    conditional_paths?: any[];
    custom_fields?: Record<string, any>;
    metadata?: Record<string, any>;
    category?: string;
    key?: string;
    documentation?: string;
    lf_version?: string;
    output_types?: string[];
  };
  selected_output?: string;
  showNode?: boolean;
}>;

/**
 * Langflow connection between nodes.
 */
export type FlowEdge = Edge<{
  sourceHandle: any;
  targetHandle: any;
}>;

/**
 * Component definition from Langflow's catalog.
 */
export interface LangflowComponent {
  name: string;
  display_name: string;
  description: string;
  category: string;
  subcategory?: string;
  parameters: ComponentParameter[];
  input_types?: string[];
  output_types?: string[];
  tool_mode?: boolean;
  legacy?: boolean;
  beta?: boolean;
  documentation_link?: string;
  documentation?: string;
  icon?: string;
  base_classes?: string[];
  frozen?: boolean;
  field_order?: string[];
  conditional_paths?: any[];
  custom_fields?: Record<string, any>;
  metadata?: Record<string, any>;
  lf_version?: string;
  template?: Record<string, any>;
  outputs?: any[];
}

export type FlatComponentCatalog = Record<string, LangflowComponent>;

/**
 * Component parameter definition.
 */
export interface ComponentParameter {
  name: string;
  display_name?: string;
  type: string;
  required: boolean;
  default?: any;
  description?: string;
  options?: any[];
  placeholder?: string;
  password?: boolean;
  multiline?: boolean;
  file_types?: string[];
  input_types?: string[];
  load_from_db?: boolean;
  advanced?: boolean;
  show?: boolean;
}

/**
 * Complete Langflow flow structure.
 */
export interface LangflowFlow {
  name: string;
  description?: string;
  data: {
    nodes: FlowNode[];
    edges: FlowEdge[];
    viewport?: {
      x: number;
      y: number;
      zoom: number;
    };
  };
  tags?: string[];
  is_component?: boolean;
  updated_at?: string;
  folder?: string;
  id?: string;
  user_id?: string;
  metadata?: Record<string, any>;
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  nodeId?: string;
  message: string;
  fix?: string;
  affectedField?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  summary: {
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
}

export interface ComponentSearchQuery {
  query?: string;
  category?: string;
  limit?: number;
  tool_mode?: boolean;
  legacy?: boolean;
}

export interface ServerConfig {
  componentsJsonPath: string;
  databasePath: string;
  docsPath: string;
  port?: number;
}

export interface MCPToolResponse {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

export * from './types/flowDiff.js';
