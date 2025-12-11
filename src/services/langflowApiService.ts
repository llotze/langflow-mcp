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

/**
 * LangflowApiService provides a client for interacting with the Langflow REST API.
 * Supports per-user authentication via API keys.
 */
export class LangflowApiService {
  public client: AxiosInstance;
  public baseUrl: string;
  private authToken?: string; // ✅ Session token (Bearer or Cookie)

  /**
   * Creates a new Langflow API client.
   * 
   * @param apiUrl - Base URL of the Langflow instance
   * @param apiKey - User's API key (required for Langflow v1.5+)
   */
  constructor(apiUrl: string, apiKey?: string) {
    this.baseUrl = apiUrl.replace(/\/$/, ''); 
    this.authToken = apiKey;
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });

    // Add authentication headers to all requests
    this.client.interceptors.request.use(
      (config) => {
        config.headers.set('Content-Type', 'application/json');

        if (this.authToken) {
          config.headers.set('x-api-key', this.authToken);
        }

        return config;
      },
      (error) => Promise.reject(error)
    );
  }

  /**
   * Constructs auth headers from API key
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      // ✅ Langflow v1.5+ requires x-api-key header
      headers['x-api-key'] = this.authToken;
      console.log('🔐 Adding x-api-key header to Langflow request');
    } else {
      console.warn('⚠️ No API key available for Langflow request');
    }

    return headers;
  }

  /**
   * Updates the API key for subsequent requests
   */
  setAuthToken(token: string): void {
    this.authToken = token;
    console.log('🔄 Updated Langflow API key');
  }

  /**
   * Tests connectivity to the Langflow API.
   * 
   * @returns true if connection successful, false otherwise
   * 
   * This is useful for validating API credentials and network connectivity
   * before attempting more complex operations.
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
   * Creates a new flow in Langflow.
   * 
   * @param flow - Complete flow definition including nodes, edges, and metadata
   * @returns Created workflow with server-generated ID and timestamps
   * 
   * The flow is validated by Langflow before creation. If validation fails,
   * an error is thrown with details about what needs to be fixed.
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
   * Updates an existing flow in Langflow.
   * 
   * @param flowId - UUID of the flow to update
   * @param flow - Updated flow definition
   * @returns Updated workflow with new timestamp
   * 
   * This operation uses PATCH semantics, so only the provided fields
   * are updated. Missing fields retain their current values.
   */
  async updateFlow(flowId: string, flow: LangflowFlow): Promise<any> {
    try {
      const response = await this.client.patch(`/api/v1/flows/${flowId}`, {
        name: flow.name,
        description: flow.description,
        data: flow.data,
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
   * Retrieves a flow by its ID.
   * 
   * @param flowId - UUID of the flow to retrieve
   * @returns Complete flow definition including all nodes and edges
   * 
   * @throws Error if flow does not exist or user lacks permission
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
   * Lists all flows accessible to the current user.
   * 
   * @param params - Optional pagination and filtering parameters
   * @param params.page - Page number for pagination (0-indexed)
   * @param params.size - Number of flows per page
   * @param params.project_id - Filter flows by project
   * @returns Array of workflow summaries
   * 
   * Results are paginated. For large numbers of flows, make multiple
   * requests with different page numbers.
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
   * Permanently deletes a flow.
   * 
   * @param flowId - UUID of the flow to delete
   * 
   * @throws Error if flow does not exist or user lacks permission
   * 
   * WARNING: This operation cannot be undone. Consider exporting
   * the flow before deletion if you may need it later.
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
   * Executes a flow with the provided inputs.
   * 
   * @param flowId - UUID of the flow to run
   * @param inputs - Execution parameters
   * @param inputs.input_value - Primary input to the flow
   * @param inputs.session_id - Session ID for conversation continuity
   * @param inputs.input_type - Type of input (e.g., 'text', 'chat')
   * @param inputs.output_type - Type of output expected
   * @param inputs.tweaks - Runtime parameter overrides
   * @returns Execution result with outputs and session information
   * 
   * Executes synchronously with stream=false. For streaming responses,
   * use the WebSocket endpoint directly.
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
   * Exports multiple flows as a ZIP archive.
   * 
   * @param flowIds - Array of flow UUIDs to export
   * @returns Buffer containing ZIP file data
   * 
   * The ZIP contains JSON files for each flow, suitable for
   * backup, version control, or sharing with other users.
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
   * Imports flows from a JSON string.
   * 
   * @param flowJson - JSON string containing flow definition(s)
   * @param projectId - Optional project ID to import flows into
   * @returns Array of created workflows with server-generated IDs
   * 
   * Supports both single flows and arrays of flows. Flows are
   * validated before import and may be modified to ensure compatibility.
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
   * Formats error messages for consistent error reporting.
   * 
   * Extracts detailed information from Axios errors including:
   * - HTTP status codes and messages
   * - Response body data
   * - Network connectivity issues
   * 
   * @param error - Error object from a failed request
   * @returns Human-readable error message
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