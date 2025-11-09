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
  };
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    type: string;
    node: {
      template: Record<string, any>;
      display_name?: string;  
      description?: string;   
      [key: string]: any;
    };
  };
}

export interface FlowEdge {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface FlowTemplate {
  name: string;
  description: string;
  data: LangflowFlow;
}

export interface MCPToolResponse {
  success: boolean;
  data?: any;
  error?: string;
  message?: string; // Added this
}

export interface FlowDiffOperation {
  operation: 'addNode' | 'removeNode' | 'updateNode' | 'addConnection' | 'removeConnection' | 'updateFlowMetadata';
  nodeId?: string;
  node?: FlowNode;
  edge?: FlowEdge;
  updates?: Partial<FlowNode>;
  metadata?: Record<string, any>;
}

export interface ComponentSearchQuery {
  query?: string;
  category?: string;
  limit?: number;
  tool_mode?: boolean;
  legacy?: boolean;
}
