/**
 * Maps Python class names (used in edges) to Catalog display names (used for lookups).
 * 
 * CRITICAL: node.data.type must ALWAYS stay as Python class name for edge validation.
 * This mapping is ONLY for finding components in the catalog.
 * 
 * Direction: Python Class Name → Catalog Display Name
 */
export const COMPONENT_NAME_MAP: Record<string, string> = {
  // Core template mappings
  'Prompt': 'Prompt Template',
  'PromptComponent': 'Prompt Template',
  
  // Memory/History mappings
  'Memory': 'Message History',
  'MemoryComponent': 'Message History',
  
  // Add other mappings as discovered
  // 'Python Class Name': 'Catalog Display Name'
};

/**
 * Finds component in catalog by trying both class name and display name.
 * Returns the component AND the original class name to preserve in node.data.type.
 * 
 * @param className - Python class name (e.g., "Prompt")
 * @param catalog - Component catalog to search
 * @returns Object with component and original className, or null if not found
 */
export function findComponentInCatalog(
  className: string,
  catalog: Record<string, any>
): { component: any; className: string } | null {
  // Try original class name first
  if (catalog[className]) {
    return { component: catalog[className], className };
  }
  
  // Try display name mapping
  const displayName = COMPONENT_NAME_MAP[className];
  if (displayName && catalog[displayName]) {
    return { component: catalog[displayName], className }; // Return ORIGINAL class name
  }
  
  return null;
}

export function normalizeComponentName(componentName: string): string {
  return COMPONENT_NAME_MAP[componentName] || componentName;
}

export function shouldNormalizeComponentName(componentName: string): boolean {
  return componentName in COMPONENT_NAME_MAP;
}

export function getDisplayName(catalogName: string): string {
  // Reverse lookup - find the template name from catalog name
  for (const [templateName, catalogDisplayName] of Object.entries(COMPONENT_NAME_MAP)) {
    if (catalogDisplayName === catalogName) {
      return templateName;
    }
  }
  return catalogName;
}

/**
 * Gets the Python class name from a catalog display name (reverse lookup).
 */
export function getClassName(displayName: string): string {
  for (const [className, catalogName] of Object.entries(COMPONENT_NAME_MAP)) {
    if (catalogName === displayName) {
      return className;
    }
  }
  return displayName;
}