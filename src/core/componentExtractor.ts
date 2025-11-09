import * as fs from 'fs';
import * as path from 'path';
import { LangflowComponent, ComponentParameter } from '../types.js';

export class ComponentExtractor {
  private componentsJsonPath: string;
  private docsPath: string;

  constructor(componentsJsonPath: string, docsPath: string) {
    this.componentsJsonPath = componentsJsonPath;
    this.docsPath = docsPath;
  }

  /**
   * Load components from components.json
   */
  public loadComponents(): LangflowComponent[] {
    try {
      if (!fs.existsSync(this.componentsJsonPath)) {
        console.warn(`Components JSON file not found at ${this.componentsJsonPath}`);
        return [];
      }

      const data = fs.readFileSync(this.componentsJsonPath, 'utf-8');
      const componentsData = JSON.parse(data);

      // Parse the components structure
      return this.parseComponents(componentsData);
    } catch (error) {
      console.error('Error loading components:', error);
      return [];
    }
  }

  /**
   * Parse components from the JSON structure
   * Real Langflow structure: { category: { componentName: componentData } }
   */
  private parseComponents(componentsData: any): LangflowComponent[] {
    const components: LangflowComponent[] = [];

    if (!componentsData || typeof componentsData !== 'object') {
      console.warn('Invalid components data structure');
      return components;
    }

    // Iterate through categories (top level keys)
    Object.keys(componentsData).forEach(category => {
      const categoryComponents = componentsData[category];
      
      // Each category contains components as key-value pairs
      if (typeof categoryComponents === 'object' && !Array.isArray(categoryComponents)) {
        Object.keys(categoryComponents).forEach(componentName => {
          const componentData = categoryComponents[componentName];
          
          try {
            const parsed = this.parseComponent(componentData, componentName, category);
            components.push(parsed);
          } catch (error) {
            console.error(`Error parsing component ${componentName} in category ${category}:`, error);
          }
        });
      }
    });

    return components;
  }

  /**
   * Parse a single component
   */
  private parseComponent(comp: any, name: string, category: string): LangflowComponent {
    return {
      name: name,
      display_name: comp.display_name || name,
      description: comp.description || '',
      category: category,
      subcategory: comp.subcategory,
      parameters: this.extractParameters(comp.template || {}),
      input_types: this.extractInputTypes(comp.template || {}),
      output_types: comp.output_types || [],
      tool_mode: comp.tool_mode || false,
      legacy: comp.legacy || false,
      beta: comp.beta || comp.experimental || false,
      documentation_link: comp.documentation,
      icon: comp.icon,
      base_classes: comp.base_classes || [],
      frozen: comp.frozen || false,
      field_order: comp.field_order || [],
    };
  }

  /**
   * Extract parameters from component template
   * FIXED: Properly extracts all parameters including input_value, api_key, etc.
   */
  private extractParameters(template: any): ComponentParameter[] {
    const parameters: ComponentParameter[] = [];

    if (!template || typeof template !== 'object') {
      return parameters;
    }

    Object.keys(template).forEach(key => {
      const field = template[key];
      
      // Only skip these specific internal fields
      if (key === '_type' || key === 'code') {
        return;
      }

      // Skip if field is explicitly marked as not shown
      // Note: show defaults to true if not specified
      if (field.show === false) {
        return;
      }

      try {
        parameters.push({
          name: field.name || key,
          display_name: field.display_name || field.name || key,
          type: this.mapLangflowType(field.type || 'str'),
          required: false, // ✅ Always false - Langflow handles defaults
          default: field.value !== undefined ? field.value : field.default,
          description: field.info || field.description || field.placeholder || '',
          options: field.options || field.list,
          placeholder: field.placeholder,
          password: field.password || false,
          multiline: field.multiline || false,
          file_types: field.fileTypes || field.file_types,
          input_types: field.input_types,
          load_from_db: field.load_from_db || false,
          advanced: field.advanced === true,  // Track if advanced
          show: field.show !== false,  // Track visibility
        });
      } catch (error) {
        console.error(`Error parsing parameter ${key}:`, error);
      }
    });

    return parameters;
  }

  /**
   * Map Langflow field types to standard types
   */
  private mapLangflowType(langflowType: string): string {
    const typeMap: Record<string, string> = {
      'str': 'string',
      'int': 'integer',
      'float': 'number',
      'bool': 'boolean',
      'dict': 'object',
      'NestedDict': 'object',
      'code': 'code',
      'file': 'file',
      'prompt': 'prompt',
      'Text': 'string',
      'Message': 'message',
      'Data': 'data',
      'DataFrame': 'dataframe',
      'slider': 'number',
      'other': 'any',
    };
    
    return typeMap[langflowType] || langflowType.toLowerCase();
  }

  /**
   * Extract input types from template fields
   * Input types define what kind of data a field can accept
   */
  private extractInputTypes(template: any): string[] {
    if (!template || typeof template !== 'object') {
      return [];
    }

    const inputTypes = new Set<string>();

    Object.keys(template).forEach(key => {
      const field = template[key];
      
      if (field.input_types && Array.isArray(field.input_types)) {
        field.input_types.forEach((type: string) => inputTypes.add(type));
      }
      
      // Also check the field type itself
      if (field.type && typeof field.type === 'string') {
        inputTypes.add(field.type);
      }
    });

    return Array.from(inputTypes);
  }

  /**
   * Load markdown documentation for a component
   */
  public loadComponentDocs(componentName: string): string | null {
    try {
      // Try different possible doc file locations
      const possiblePaths = [
        path.join(this.docsPath, `${componentName}.md`),
        path.join(this.docsPath, `${componentName}.mdx`),
        path.join(this.docsPath, 'components', `${componentName}.md`),
        path.join(this.docsPath, 'components', `${componentName}.mdx`),
        // Also try kebab-case versions
        path.join(this.docsPath, `${this.toKebabCase(componentName)}.md`),
        path.join(this.docsPath, `${this.toKebabCase(componentName)}.mdx`),
      ];

      for (const docPath of possiblePaths) {
        if (fs.existsSync(docPath)) {
          return fs.readFileSync(docPath, 'utf-8');
        }
      }

      return null;
    } catch (error) {
      console.error(`Error loading docs for ${componentName}:`, error);
      return null;
    }
  }

  /**
   * Convert string to kebab-case
   */
  private toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }
}
