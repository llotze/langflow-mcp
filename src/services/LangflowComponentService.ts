import { LangflowApiService } from './langflowApiService.js';

export interface ComponentCatalog {
  [category: string]: {
    [componentName: string]: any;
  };
}

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

export class LangflowComponentService {
  constructor(private apiClient: LangflowApiService) {}

  /**
   * Get ALL components from Langflow (the source of truth)
   */
  async getAllComponents(): Promise<ComponentCatalog> {
    const response = await this.apiClient.client.get('/api/v1/all');
    return response.data; // Returns full component catalog with templates
  }

  /**
   * Get a specific component's template
   */
  async getComponentTemplate(componentName: string): Promise<any> {
    const catalog = await this.getAllComponents();
    for (const category in catalog) {
      if (catalog[category][componentName]) {
        const component = catalog[category][componentName];
        // Extract parameters from template
        component.parameters = extractParametersFromTemplate(component.template);
        return component;
      }
    }
    throw new Error(`Component ${componentName} not found in Langflow`);
  }

  /**
   * Search components by keyword
   */
  async searchComponents(keyword: string, limit: number = 20): Promise<any[]> {
    const catalog = await this.getAllComponents();
    const results = [];
    const keywordLower = keyword.toLowerCase();
    
    for (const category in catalog) {
      for (const name in catalog[category]) {
        const component = catalog[category][name];
        
        // Search in name, display_name, and description
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
   * Get components by category
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
   * List all available categories
   */
  async getCategories(): Promise<string[]> {
    const catalog = await this.getAllComponents();
    return Object.keys(catalog);
  }
}