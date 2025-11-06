import { Request, Response } from 'express';
import { ComponentRegistry } from './core/registry'; 
import { ComponentSearchQuery, MCPToolResponse, FlowDiffOperation, LangflowFlow, FlowNode, FlowEdge } from './types';
import * as fs from 'fs';
import * as path from 'path';

export class MCPTools {
  private registry: ComponentRegistry;
  private templatesPath: string;

  constructor(registry: ComponentRegistry, templatesPath: string) {
    this.registry = registry;
    this.templatesPath = templatesPath;
  }

  /**
   * List all components
   */
  public async listComponents(req: Request, res: Response): Promise<void> {
    try {
      const components = await this.registry.getAllComponents();
      const response: MCPToolResponse = {
        success: true,
        data: components,
      };
      res.json(response);
    } catch (error) {
      this.handleError(res, error, 'Failed to list components');
    }
  }

  /**
   * Search components
   */
  public async searchComponents(req: Request, res: Response): Promise<void> {
    try {
      const query: ComponentSearchQuery = req.body;
      const components = await this.registry.searchComponents(query);
      const response: MCPToolResponse = {
        success: true,
        data: components,
      };
      res.json(response);
    } catch (error) {
      this.handleError(res, error, 'Failed to search components');
    }
  }

  /**
   * Get component essentials (common/required properties only)
   */
  public async getComponentEssentials(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;
      const component = await this.registry.getComponent(name);

      if (!component) {
        res.status(404).json({
          success: false,
          error: 'Component not found',
        });
        return;
      }

      // Extract only essential/common properties
      const essentials = {
        name: component.name,
        display_name: component.display_name,
        description: component.description,
        category: component.category,
        tool_mode: component.tool_mode,
        required_parameters: component.parameters.filter(p => p.required),
        common_parameters: component.parameters.filter(p => !p.required).slice(0, 5),
        input_types: component.input_types,
        output_types: component.output_types,
      };

      const response: MCPToolResponse = {
        success: true,
        data: essentials,
      };
      res.json(response);
    } catch (error) {
      this.handleError(res, error, 'Failed to get component essentials');
    }
  }

  /**
   * Get component documentation
   */
  public async getComponentDocumentation(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;
      const docs = await this.registry.getComponentDocs(name);

      if (!docs) {
        res.status(404).json({
          success: false,
          error: 'Documentation not found',
        });
        return;
      }

      const response: MCPToolResponse = {
        success: true,
        data: { documentation: docs },
      };
      res.json(response);
    } catch (error) {
      this.handleError(res, error, 'Failed to get component documentation');
    }
  }

  /**
   * Validate component configuration
   */
  public async validateComponentConfig(req: Request, res: Response): Promise<void> {
    try {
      const { name, config } = req.body;
      const component = await this.registry.getComponent(name);

      if (!component) {
        res.status(404).json({
          success: false,
          error: 'Component not found',
        });
        return;
      }

      const errors: string[] = [];

      // Check required parameters
      component.parameters
        .filter(p => p.required)
        .forEach(param => {
          if (!(param.name in config)) {
            errors.push(`Missing required parameter: ${param.name}`);
          }
        });

      const response: MCPToolResponse = {
        success: errors.length === 0,
        data: {
          valid: errors.length === 0,
          errors,
        },
      };
      res.json(response);
    } catch (error) {
      this.handleError(res, error, 'Failed to validate component config');
    }
  }

  /**
   * Create a new flow
   */
  public async createFlow(req: Request, res: Response): Promise<void> {
    try {
      const { name, description, nodes, edges } = req.body;

      const flow: LangflowFlow = {
        name,
        description,
        data: {
          nodes: nodes || [],
          edges: edges || [],
        },
        tags: [],
      };

      const response: MCPToolResponse = {
        success: true,
        data: flow,
        message: 'Flow created successfully',
      };
      res.json(response);
    } catch (error) {
      this.handleError(res, error, 'Failed to create flow');
    }
  }

  /**
   * Update flow with diff operations
   */
  public async updateFlowPartial(req: Request, res: Response): Promise<void> {
    try {
      const { flow, operations } = req.body as { flow: LangflowFlow; operations: FlowDiffOperation[] };

      let updatedFlow = { ...flow };

      for (const op of operations) {
        updatedFlow = this.applyFlowOperation(updatedFlow, op);
      }

      const response: MCPToolResponse = {
        success: true,
        data: updatedFlow,
        message: `Applied ${operations.length} operations successfully`,
      };
      res.json(response);
    } catch (error) {
      this.handleError(res, error, 'Failed to update flow');
    }
  }

  /**
   * List flow templates
   */
  public async listFlowTemplates(req: Request, res: Response): Promise<void> {
    try {
      if (!fs.existsSync(this.templatesPath)) {
        fs.mkdirSync(this.templatesPath, { recursive: true });
      }

      const files = fs.readdirSync(this.templatesPath).filter(f => f.endsWith('.json'));
      const templates = files.map(file => {
        const content = fs.readFileSync(path.join(this.templatesPath, file), 'utf-8');
        const data = JSON.parse(content);
        return {
          name: data.name || file.replace('.json', ''),
          description: data.description || '',
          tags: data.tags || [],
        };
      });

      const response: MCPToolResponse = {
        success: true,
        data: templates,
      };
      res.json(response);
    } catch (error) {
      this.handleError(res, error, 'Failed to list flow templates');
    }
  }

  /**
   * Get a specific flow template
   */
  public async getFlowTemplate(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;
      const templatePath = path.join(this.templatesPath, `${name}.json`);

      if (!fs.existsSync(templatePath)) {
        res.status(404).json({
          success: false,
          error: 'Template not found',
        });
        return;
      }

      const content = fs.readFileSync(templatePath, 'utf-8');
      const template = JSON.parse(content);

      const response: MCPToolResponse = {
        success: true,
        data: template,
      };
      res.json(response);
    } catch (error) {
      this.handleError(res, error, 'Failed to get flow template');
    }
  }

  /**
   * Get all categories
   */
  public async getCategories(req: Request, res: Response): Promise<void> {
    try {
      const categories = await this.registry.getCategories();
      const response: MCPToolResponse = {
        success: true,
        data: categories,
      };
      res.json(response);
    } catch (error) {
      this.handleError(res, error, 'Failed to get categories');
    }
  }

  /**
   * Apply a single flow operation
   */
  private applyFlowOperation(flow: LangflowFlow, op: FlowDiffOperation): LangflowFlow {
    const updatedFlow = { ...flow };

    switch (op.operation) {
      case 'addNode':
        if (op.node) {
          updatedFlow.data.nodes.push(op.node);
        }
        break;

      case 'removeNode':
        if (op.nodeId) {
          updatedFlow.data.nodes = updatedFlow.data.nodes.filter(n => n.id !== op.nodeId);
          updatedFlow.data.edges = updatedFlow.data.edges.filter(
            e => e.source !== op.nodeId && e.target !== op.nodeId
          );
        }
        break;

      case 'updateNode':
        if (op.nodeId && op.updates) {
          const nodeIndex = updatedFlow.data.nodes.findIndex(n => n.id === op.nodeId);
          if (nodeIndex >= 0) {
            updatedFlow.data.nodes[nodeIndex] = {
              ...updatedFlow.data.nodes[nodeIndex],
              ...op.updates,
            };
          }
        }
        break;

      case 'addConnection':
        if (op.edge) {
          updatedFlow.data.edges.push(op.edge);
        }
        break;

      case 'removeConnection':
        if (op.edge) {
          updatedFlow.data.edges = updatedFlow.data.edges.filter(
            e => !(e.source === op.edge!.source && e.target === op.edge!.target)
          );
        }
        break;

      case 'updateFlowMetadata':
        if (op.metadata) {
          updatedFlow.metadata = { ...updatedFlow.metadata, ...op.metadata };
        }
        break;
    }

    return updatedFlow;
  }

  /**
   * Handle errors
   */
  private handleError(res: Response, error: any, message: string): void {
    console.error(message, error);
    res.status(500).json({
      success: false,
      error: message,
      message: error.message,
    });
  }
}
