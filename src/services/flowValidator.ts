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

/**
 * FlowValidator ensures Langflow flow structural integrity and correctness.
 * 
 * Validates flows against the component catalog, checking:
 * - Flow metadata completeness
 * - Node structure and component compatibility
 * - Required parameters and type correctness
 * - Edge validity and graph connectivity
 * - Orphaned nodes and potential issues
 */
export class FlowValidator {
  constructor(private componentCatalog: Record<string, LangflowComponent>) {}

  /**
   * Validates an entire flow structure.
   * 
   * @param flow - The Langflow flow to validate
   * @returns Validation result with issues categorized by severity
   * 
   * Performs comprehensive validation including metadata, nodes, edges,
   * and connectivity analysis. Returns all issues found, allowing the
   * caller to decide whether to proceed based on error vs warning counts.
   */
  async validateFlow(flow: LangflowFlow): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];

    if (!flow.name || flow.name.trim().length === 0) {
      issues.push({
        severity: 'error',
        message: 'Flow name is required',
        fix: 'Set flow.name to a non-empty string',
      });
    }

    if (!flow.data?.nodes || !Array.isArray(flow.data.nodes)) {
      issues.push({
        severity: 'error',
        message: 'Flow must have a data.nodes array',
        fix: 'Set flow.data.nodes = []',
      });
      return this.buildResult(flow, issues);
    }

    // Validate each node
    for (const node of flow.data.nodes) {
      const nodeIssues = await this.validateNode(node);
      issues.push(...nodeIssues);
    }

    // Validate edges
    if (flow.data.edges && Array.isArray(flow.data.edges)) {
      for (const edge of flow.data.edges) {
        const edgeIssues = this.validateEdge(edge, flow.data.nodes);
        issues.push(...edgeIssues);
      }
    }

    // Detect orphaned nodes
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
   * Validates a single node's structure, type, and parameters.
   * 
   * Ensures the node:
   * - Has a valid ID and type
   * - References an existing component in the catalog
   * - Contains properly structured data.node.template
   * - Has all required parameters with correct types
   * - Has valid position coordinates
   */
  private async validateNode(node: FlowNode): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    if (!node.id || node.id.trim().length === 0) {
      issues.push({
        severity: 'error',
        nodeId: node.id,
        message: 'Node ID is required',
        fix: 'Set node.id to a unique string',
      });
    }

    if (!node.type) {
      issues.push({
        severity: 'error',
        nodeId: node.id,
        message: 'Node type is required',
        fix: 'Set node.type to a valid Langflow component name',
      });
      return issues;
    }

    const component = this.componentCatalog[node.type];
    if (!component) {
      issues.push({
        severity: 'error',
        nodeId: node.id,
        message: `Unknown component type: "${node.type}"`,
        fix: `Use search_components tool to find valid component names`,
      });
      return issues;
    }

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

    /**
     * Extract parameters from template if not pre-populated.
     * Some components store parameter definitions only in the template,
     * so we reconstruct the parameters array on-demand.
     */
    if (!component.parameters && component.template) {
      component.parameters = Object.entries(component.template)
        .filter(([key, value]) => typeof value === 'object' && (value as any).name)
        .map(([key, value]) => {
          const param: any = value;
          return {
            name: param.name,
            display_name: param.display_name,
            type: param.type,
            required: param.required || false,
            default: param.value,
            description: param.info || param.description,
            advanced: param.advanced,
            show: param.show,
          };
        });
    }

    const paramIssues = this.validateNodeParameters(node, component);
    issues.push(...paramIssues);

    // Validate parameter types
    for (const [paramName, paramValue] of Object.entries(node.data.node.template)) {
      const paramDef = component.parameters.find(p => p.name === paramName);
      
      if (!paramDef) {
        issues.push({
          severity: 'warning',
          nodeId: node.id,
          message: `Unknown parameter: "${paramName}"`,
          fix: `Remove this parameter or check component documentation`,
          affectedField: paramName,
        });
        continue;
      }

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
   * Validates node parameters with intelligent default handling.
   * 
   * A parameter is only flagged as missing if:
   * 1. It's explicitly marked as required=true, AND
   * 2. It has no default value available
   * 
   * This prevents false positives for parameters with empty string defaults
   * or environment variable placeholders like "OPENAI_API_KEY".
   */
  private validateNodeParameters(node: FlowNode, component: LangflowComponent): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const template = node.data?.node?.template || {};

    if (!component.parameters || !Array.isArray(component.parameters)) {
      console.warn(`Component "${component.name}" has no parameters array, skipping validation`);
      return issues;
    }

    const parameters = component.parameters;

    parameters.forEach((param) => {
      const hasDefault = param.default !== undefined && param.default !== null;
      const isRequired = param.required === true && !hasDefault;
      
      if (isRequired) {
        const value = template[param.name];
        
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

      // Warn about missing API keys (important but not blocking)
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
   * Validates an edge connection between two nodes.
   * 
   * Ensures:
   * - Source and target nodes exist in the flow
   * - No self-loops (node connecting to itself)
   */
  private validateEdge(edge: FlowEdge, nodes: FlowNode[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    const sourceNode = nodes.find(n => n.id === edge.source);
    if (!sourceNode) {
      issues.push({
        severity: 'error',
        edgeId: `${edge.source}->${edge.target}`,
        message: `Edge references non-existent source node: "${edge.source}"`,
        fix: 'Remove this edge or fix the source node ID',
      });
    }

    const targetNode = nodes.find(n => n.id === edge.target);
    if (!targetNode) {
      issues.push({
        severity: 'error',
        edgeId: `${edge.source}->${edge.target}`,
        message: `Edge references non-existent target node: "${edge.target}"`,
        fix: 'Remove this edge or fix the target node ID',
      });
    }

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
   * Validates that a parameter value matches its expected type.
   * 
   * @param value - The actual parameter value
   * @param expectedType - The type defined in the component catalog
   * @returns true if type matches, false otherwise
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
        return typeof value === 'string';
      default:
        return true;
    }
  }

  /**
   * Builds the final validation result with summary statistics.
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