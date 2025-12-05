import axios, { AxiosInstance, AxiosError } from 'axios';
import { LangflowFlow } from '../types.js';

export interface LangflowWorkflow {
  id: string;
  name: string;
  description: string;
  data: any;
  updated_at?: string;
  folder_id?: string;
  user_id?: string;
  project_id?: string;
}

export interface FlowRunResult {
  session_id: string;
  outputs: Array<{
    inputs: Record<string, any>;
    outputs: Array<{
      results: Record<string, any>;
    }>;
  }>;
}

export class LangflowApiService {
  public client: AxiosInstance;  // Make public for component service
  public baseUrl: string;        // Make public for URL building

  constructor(apiUrl: string, apiKey: string) {
    this.baseUrl = apiUrl.replace(/\/$/, ''); 
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      timeout: 30000, // 30 second timeout
    });
  }

  /**
   * Test connection to Langflow API
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/v1/version');
      console.log('✅ Connected to Langflow:', response.data);
      return response.status === 200;
    } catch (error) {
      console.error('❌ Langflow API connection failed:', this.formatError(error));
      return false;
    }
  }

  /**
   * Create a new flow in Langflow
   */
  async createFlow(flow: LangflowFlow): Promise<LangflowWorkflow> {
    try {
      const response = await this.client.post('/api/v1/flows/', flow);
      console.log(`✅ Created flow: ${response.data.name} (${response.data.id})`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create flow: ${this.formatError(error)}`);
    }
  }

  /**
   * Update an existing flow
   */
  async updateFlow(flowId: string, flow: LangflowFlow): Promise<any> {
    try {
      // Send the complete flow object to Langflow
      const response = await this.client.patch(`/api/v1/flows/${flowId}`, {
        name: flow.name,
        description: flow.description,
        data: flow.data, // Full data object with nodes and edges
        tags: flow.tags || [],
        is_component: flow.is_component || false,
      });
      console.log(`✅ Updated flow: ${response.data.name} (${response.data.id})`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to update flow: ${this.formatError(error)}`);
    }
  }

  /**
   * Get a flow by ID
   */
  async getFlow(flowId: string): Promise<LangflowWorkflow> {
    try {
      const response = await this.client.get(`/api/v1/flows/${flowId}`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get flow: ${this.formatError(error)}`);
    }
  }

  /**
   * List all flows (with pagination)
   */
  async listFlows(params?: {
    page?: number;
    size?: number;
    project_id?: string;
  }): Promise<LangflowWorkflow[]> {
    try {
      const response = await this.client.get('/api/v1/flows/', { params });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to list flows: ${this.formatError(error)}`);
    }
  }

  /**
   * Delete a flow
   */
  async deleteFlow(flowId: string): Promise<void> {
    try {
      await this.client.delete(`/api/v1/flows/${flowId}`);
      console.log(`✅ Deleted flow: ${flowId}`);
    } catch (error) {
      throw new Error(`Failed to delete flow: ${this.formatError(error)}`);
    }
  }

  /**
   * Run a flow (trigger execution)
   */
  async runFlow(
    flowId: string, 
    inputs?: {
      input_value?: string;
      session_id?: string;
      input_type?: string;
      output_type?: string;
      tweaks?: Record<string, any>;
    }
  ): Promise<FlowRunResult> {
    try {
      const response = await this.client.post(
        `/api/v1/run/${flowId}?stream=false`,
        inputs || {}
      );
      console.log(`✅ Ran flow: ${flowId}`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to run flow: ${this.formatError(error)}`);
    }
  }

  /**
   * Export flows to ZIP
   */
  async exportFlows(flowIds: string[]): Promise<Buffer> {
    try {
      const response = await this.client.post(
        '/api/v1/flows/download/',
        flowIds,
        { responseType: 'arraybuffer' }
      );
      return Buffer.from(response.data);
    } catch (error) {
      throw new Error(`Failed to export flows: ${this.formatError(error)}`);
    }
  }

  /**
   * Import flows from JSON
   */
  async importFlow(
    flowJson: string, 
    projectId?: string
  ): Promise<LangflowWorkflow[]> {
    try {
      const formData = new FormData();
      const blob = new Blob([flowJson], { type: 'application/json' });
      formData.append('file', blob, 'flow.json');

      const url = projectId 
        ? `/api/v1/flows/upload/?project_id=${projectId}`
        : '/api/v1/flows/upload/';

      const response = await this.client.post(url, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log(`✅ Imported ${response.data.length} flow(s)`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to import flow: ${this.formatError(error)}`);
    }
  }

  /**
   * Format error messages
   */
  private formatError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        return `${axiosError.response.status} ${axiosError.response.statusText}: ${JSON.stringify(axiosError.response.data)}`;
      } else if (axiosError.request) {
        return 'No response from Langflow server';
      }
    }
    return error instanceof Error ? error.message : String(error);
  }
}