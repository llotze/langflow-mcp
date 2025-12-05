import { LangflowApiService } from './langflowApiService.js';

export interface ComponentCatalog {
  [category: string]: {
    [componentName: string]: any;
  };
}

/**
 * Extracts parameter definitions from a component template.
 * 
 * Converts template field objects into a standardized parameter array
 * format, making parameter metadata easier to access and validate.
 * 
 * @param template - Component template object with field definitions
 * @returns Array of parameter objects with normalized properties
 */
function extractParametersFromTemplate(template: Record<string, any>): any[] {
  if (!template || typeof template !== 'object') return [];
  return Object.entries(template)
    .filter(([key, value]) => typeof value === 'object' && value.name)
    .map(([key, value]) => ({
      name: value.name,
      display_name: value.display_name,
      type: value.type,
      required: value.required || false,
      default: value.value,
      description: value.info || value.description,
      options: value.options,
      placeholder: value.placeholder,
      password: value.password,
      multiline: value.multiline,
      file_types: value.fileTypes,
      input_types: value.input_types,
      load_from_db: value.load_from_db,
      advanced: value.advanced,
      show: value.show,
    }));
}

/**
 * LangflowComponentService provides access to Langflow's component catalog.
 * 
 * Acts as a facade for querying component definitions, templates, and metadata.
 * The component catalog is the source of truth for available components,
 * their parameters, and structural requirements.
 * 
 * Use this service to:
 * - Discover available components
 * - Retrieve component templates for flow construction
 * - Search and filter components by category or keyword
 * - Validate component names and parameters
 */
export class LangflowComponentService {
  constructor(private apiClient: LangflowApiService) {}

  /**
   * Retrieves the complete component catalog from Langflow.
   * 
   * @returns Component catalog organized by category, containing all
   *          available components with their templates and metadata
   * 
   * This is the source of truth for component definitions. The catalog
   * structure is:
   * ```
   * {
   *   "models": { "OpenAIModel": {...}, "AnthropicModel": {...} },
   *   "agents": { "AgentComponent": {...} },
   *   ...
   * }
   * ```
   */
  async getAllComponents(): Promise<ComponentCatalog> {
    const response = await this.apiClient.client.get('/api/v1/all');
    return response.data;
  }

  /**
   * Retrieves a specific component's template and metadata.
   * 
   * @param componentName - Name of the component (e.g., "OpenAIModel")
   * @returns Component definition with template and extracted parameters
   * 
   * @throws Error if component does not exist in the catalog
   * 
   * The returned object includes:
   * - `template`: Field definitions with metadata and defaults
   * - `parameters`: Extracted parameter array for easier access
   * - `display_name`, `description`, `base_classes`, etc.
   */
  async getComponentTemplate(componentName: string): Promise<any> {
    const catalog = await this.getAllComponents();
    for (const category in catalog) {
      if (catalog[category][componentName]) {
        const component = catalog[category][componentName];
        component.parameters = extractParametersFromTemplate(component.template);
        return component;
      }
    }
    throw new Error(`Component ${componentName} not found in Langflow`);
  }

  /**
   * Searches for components matching a keyword.
   * 
   * @param keyword - Search term (case-insensitive)
   * @param limit - Maximum number of results to return (default: 20)
   * @returns Array of matching component summaries
   * 
   * Searches across component names, display names, and descriptions.
   * Results are returned in discovery order (not ranked by relevance).
   * 
   * Example: `searchComponents("openai")` finds all OpenAI-related components.
   */
  async searchComponents(keyword: string, limit: number = 20): Promise<any[]> {
    const catalog = await this.getAllComponents();
    const results = [];
    const keywordLower = keyword.toLowerCase();
    
    for (const category in catalog) {
      for (const name in catalog[category]) {
        const component = catalog[category][name];
        
        const matchesName = name.toLowerCase().includes(keywordLower);
        const matchesDisplayName = component.display_name?.toLowerCase().includes(keywordLower);
        const matchesDescription = component.description?.toLowerCase().includes(keywordLower);
        
        if (matchesName || matchesDisplayName || matchesDescription) {
          results.push({
            name,
            category,
            display_name: component.display_name || name,
            description: component.description || '',
            base_classes: component.base_classes || [],
            icon: component.icon,
            beta: component.beta || false,
            legacy: component.legacy || false,
          });
          
          if (results.length >= limit) {
            return results;
          }
        }
      }
    }
    
    return results;
  }

  /**
   * Retrieves all components in a specific category.
   * 
   * @param category - Category name (e.g., "models", "agents", "prompts")
   * @returns Array of components in that category, or empty array if not found
   * 
   * Common categories include:
   * - `models`: Language models (OpenAI, Anthropic, etc.)
   * - `agents`: Agent components
   * - `prompts`: Prompt templates
   * - `memories`: Memory and context management
   * - `embeddings`: Embedding models
   * - `vectorstores`: Vector database connectors
   */
  async getComponentsByCategory(category: string): Promise<any[]> {
    const catalog = await this.getAllComponents();
    
    if (!catalog[category]) {
      return [];
    }
    
    return Object.keys(catalog[category]).map(name => ({
      name,
      category,
      ...catalog[category][name],
    }));
  }

  /**
   * Lists all available component categories.
   * 
   * @returns Array of category names
   * 
   * Useful for discovering what types of components are available
   * before drilling into specific categories.
   */
  async getCategories(): Promise<string[]> {
    const catalog = await this.getAllComponents();
    return Object.keys(catalog);
  }
}