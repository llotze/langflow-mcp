import { LangflowFlow, FlowNode, FlowEdge, LangflowComponent } from '../types.js';

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  nodeId?: string;
  edgeId?: string;
  message: string;
  fix?: string;
  affectedField?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  summary: {
    totalNodes: number;
    totalEdges: number;
    errors: number;
    warnings: number;
  };
}

export class FlowValidator {
  constructor(private componentCatalog: Record<string, LangflowComponent>) {}

  /**
   * Validate entire flow structure
   */
  async validateFlow(flow: LangflowFlow): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];

    // 1. Validate flow metadata
    if (!flow.name || flow.name.trim().length === 0) {
      issues.push({
        severity: 'error',
        message: 'Flow name is required',
        fix: 'Set flow.name to a non-empty string',
      });
    }

    // 2. Validate nodes array exists
    if (!flow.data?.nodes || !Array.isArray(flow.data.nodes)) {
      issues.push({
        severity: 'error',
        message: 'Flow must have a data.nodes array',
        fix: 'Set flow.data.nodes = []',
      });
      
      return this.buildResult(flow, issues);
    }

    // 3. Validate each node
    for (const node of flow.data.nodes) {
      const nodeIssues = await this.validateNode(node);
      issues.push(...nodeIssues);
    }

    // 4. Validate edges
    if (flow.data.edges && Array.isArray(flow.data.edges)) {
      for (const edge of flow.data.edges) {
        const edgeIssues = this.validateEdge(edge, flow.data.nodes);
        issues.push(...edgeIssues);
      }
    }

    // 5. Check for orphaned nodes (no connections)
    const connectedNodeIds = new Set<string>();
    flow.data.edges?.forEach(edge => {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    });

    for (const node of flow.data.nodes) {
      if (!connectedNodeIds.has(node.id) && flow.data.nodes.length > 1) {
        issues.push({
          severity: 'warning',
          nodeId: node.id,
          message: `Node "${node.id}" is not connected to any other nodes`,
          fix: 'Add edges to connect this node or remove it',
        });
      }
    }

    return this.buildResult(flow, issues);
  }

  /**
   * Validate a single node
   */
  private async validateNode(node: FlowNode): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    // 1. Validate node ID
    if (!node.id || node.id.trim().length === 0) {
      issues.push({
        severity: 'error',
        nodeId: node.id,
        message: 'Node ID is required',
        fix: 'Set node.id to a unique string',
      });
    }

    // 2. Validate node type
    if (!node.type) {
      issues.push({
        severity: 'error',
        nodeId: node.id,
        message: 'Node type is required',
        fix: 'Set node.type to a valid Langflow component name',
      });
      return issues; // Can't proceed without type
    }

    // 3. Check if component exists
    const component = this.componentCatalog[node.type];
    if (!component) {
      issues.push({
        severity: 'error',
        nodeId: node.id,
        message: `Unknown component type: "${node.type}"`,
        fix: `Use search_components tool to find valid component names`,
      });
      return issues; // Can't validate parameters without component
    }

    // 4. Validate node.data structure
    if (!node.data || typeof node.data !== 'object') {
      issues.push({
        severity: 'error',
        nodeId: node.id,
        message: 'Node must have a data object',
        fix: 'Set node.data = { type: ..., node: { template: {} } }',
      });
      return issues;
    }

    if (!node.data.node || !node.data.node.template) {
      issues.push({
        severity: 'error',
        nodeId: node.id,
        message: 'Node must have data.node.template object',
        fix: 'Set node.data.node.template = {}',
      });
      return issues;
    }

    // 5. Validate required parameters - UPDATED LOGIC
    const paramIssues = this.validateNodeParameters(node, component);
    issues.push(...paramIssues);

    // 6. Validate parameter types
    for (const [paramName, paramValue] of Object.entries(node.data.node.template)) {
      const paramDef = component.parameters.find(p => p.name === paramName);
      
      if (!paramDef) {
        // Unknown parameter - warning only
        issues.push({
          severity: 'warning',
          nodeId: node.id,
          message: `Unknown parameter: "${paramName}"`,
          fix: `Remove this parameter or check component documentation`,
          affectedField: paramName,
        });
        continue;
      }

      // Type validation
      const typeValid = this.validateParameterType(paramValue, paramDef.type);
      if (!typeValid) {
        issues.push({
          severity: 'error',
          nodeId: node.id,
          message: `Parameter "${paramName}" has wrong type. Expected ${paramDef.type}, got ${typeof paramValue}`,
          fix: `Convert value to ${paramDef.type}`,
          affectedField: paramName,
        });
      }
    }

    // 7. Validate position
    if (!node.position || typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
      issues.push({
        severity: 'warning',
        nodeId: node.id,
        message: 'Node position is invalid or missing',
        fix: 'Set node.position = { x: 100, y: 100 }',
      });
    }

    return issues;
  }

  /**
   * Validate node parameters with proper default handling
   */
  private validateNodeParameters(node: FlowNode, component: LangflowComponent): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const template = node.data?.node?.template || {};

    // Defensive: Ensure parameters is an array
    const parameters = Array.isArray(component.parameters) ? component.parameters : [];

    parameters.forEach((param) => {
      // A parameter is only truly required if:
      // 1. It's explicitly marked as required=true, AND
      // 2. It doesn't have a default value (including empty string defaults)
      const hasDefault = param.default !== undefined && param.default !== null;
      const isRequired = param.required === true && !hasDefault;
      
      if (isRequired) {
        const value = template[param.name];
        
        // Only flag as error if value is completely missing
        if (value === undefined || value === null) {
          issues.push({
            severity: 'error',
            message: `Missing required parameter: "${param.name}" (no default available)`,
            nodeId: node.id,
            fix: `Set node.data.node.template.${param.name} to a valid ${param.type} value`,
            affectedField: param.name,
          });
        }
      }

      // Warn about empty API keys specifically (important but not blocking)
      if (param.name === 'api_key' && param.password) {
        const value = template[param.name];
        if (!value || value === '' || value === 'OPENAI_API_KEY' || value === 'PINECONE_API_KEY') {
          issues.push({
            severity: 'warning',
            nodeId: node.id,
            message: `API key not provided for "${component.display_name}"`,
            fix: 'Set a valid API key or use environment variables',
            affectedField: param.name,
          });
        }
      }
    });

    return issues;
  }

  /**
   * Validate an edge (connection)
   */
  private validateEdge(edge: FlowEdge, nodes: FlowNode[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // 1. Validate source node exists
    const sourceNode = nodes.find(n => n.id === edge.source);
    if (!sourceNode) {
      issues.push({
        severity: 'error',
        edgeId: `${edge.source}->${edge.target}`,
        message: `Edge references non-existent source node: "${edge.source}"`,
        fix: 'Remove this edge or fix the source node ID',
      });
    }

    // 2. Validate target node exists
    const targetNode = nodes.find(n => n.id === edge.target);
    if (!targetNode) {
      issues.push({
        severity: 'error',
        edgeId: `${edge.source}->${edge.target}`,
        message: `Edge references non-existent target node: "${edge.target}"`,
        fix: 'Remove this edge or fix the target node ID',
      });
    }

    // 3. Validate no self-loops
    if (edge.source === edge.target) {
      issues.push({
        severity: 'error',
        edgeId: `${edge.source}->${edge.target}`,
        message: 'Node cannot connect to itself',
        fix: 'Change either source or target to a different node',
      });
    }

    return issues;
  }

  /**
   * Validate parameter type
   */
  private validateParameterType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'integer':
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      case 'file':
      case 'code':
      case 'prompt':
        return typeof value === 'string'; // These are text-based
      default:
        return true; // Unknown type - skip validation
    }
  }

  /**
   * Build validation result
   */
  private buildResult(flow: LangflowFlow, issues: ValidationIssue[]): ValidationResult {
    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;

    return {
      valid: errors === 0,
      issues,
      summary: {
        totalNodes: flow.data?.nodes?.length || 0,
        totalEdges: flow.data?.edges?.length || 0,
        errors,
        warnings,
      },
    };
  }
}