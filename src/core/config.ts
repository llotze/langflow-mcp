import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export interface Config {
  port: number;
  componentsJsonPath: string;
  flowTemplatesPath: string;
  docsPath: string;
  databasePath: string;
}

export function loadConfig(): Config {
  // Get __dirname equivalent in ESM
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  // Get project root (two levels up from src/core/)
  const projectRoot = path.join(__dirname, '..', '..');
  
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    componentsJsonPath: process.env.COMPONENTS_JSON_PATH || 
      path.join(projectRoot, 'data', 'components.json'),
    
    flowTemplatesPath: process.env.FLOW_TEMPLATES_PATH || 
      path.join(projectRoot, 'data', 'templates'),
    
    docsPath: process.env.DOCS_PATH || 
      path.join(projectRoot, 'data', 'docs'),
    
    databasePath: process.env.DATABASE_PATH || 
      path.join(projectRoot, 'data', 'langflow.db'),
  };
}

export function ensureDirectories(config: Config): void {
  const dirs = [
    path.dirname(config.componentsJsonPath),
    config.flowTemplatesPath,
    config.docsPath,
    path.dirname(config.databasePath),
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}
