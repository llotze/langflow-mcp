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
  icon?: string;
  base_classes?: string[];
  frozen?: boolean;
  field_order?: string[];
}

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

export interface FlowNode {
  id: string;
  type: string;
  position: {
    x: number;
    y: number;
  };
  data: {
    id?: string;
    type: string;
    node: {
      [key: string]: any;
      template: Record<string, any>;
      display_name?: string;
      description?: string;
      base_classes?: string[];
      outputs?: any[];
      icon?: string;
      beta?: boolean;
      legacy?: boolean;
      frozen?: boolean;
      field_order?: string[];
      conditional_paths?: any[];
      custom_fields?: Record<string, any>;
      edited?: boolean;
      pinned?: boolean;
      metadata?: Record<string, any>;
      category?: string;
      key?: string;
      documentation?: string;
      minimized?: boolean;
      output_types?: string[];
      tool_mode?: boolean;
    };
    selected_output?: string;
    showNode?: boolean;  
  };
  measured?: {
    height: number;
    width: number;
  };
  selected?: boolean;
  dragging?: boolean;
}

export interface FlowEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data?: {
    sourceHandle?: any;
    targetHandle?: any;
  };
  animated?: boolean;
  selected?: boolean;
  className?: string;
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

export interface FlowDiffOperation {
  operation: 'addNode' | 'removeNode' | 'updateNode' | 'addConnection' | 'removeConnection' | 'updateFlowMetadata';
  nodeId?: string;
  node?: FlowNode;
  updates?: Partial<FlowNode>;
  edge?: FlowEdge;
  metadata?: Record<string, any>;
}

export * from './types/flowDiff.js';
