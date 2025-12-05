import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_DIR = path.join(__dirname, '../../data/templates/starter_projects');

/**
 * Lists all available flow templates from the templates directory.
 * 
 * Scans the templates directory for JSON files and extracts metadata
 * including name, description, tags, and component types used.
 * 
 * @returns Array of template metadata objects
 */
export function listTemplates() {
  return fs.readdirSync(TEMPLATE_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const json = JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, f), 'utf8'));
      return {
        id: f.replace('.json', ''),
        name: json.name || f.replace('.json', '').replace(/_/g, ' '),
        description: json.description || '',
        tags: json.tags || [],
        nodes: json.data?.nodes?.map((n: any) => n.type) || [],
        file: f,
      };
    });
}

/**
 * Loads a specific template by ID.
 * 
 * @param id - Template identifier (filename without .json extension)
 * @returns Complete template object with flow data
 * @throws Error if template file does not exist
 */
export function loadTemplate(id: string) {
  const filePath = path.join(TEMPLATE_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) throw new Error('Template not found');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}