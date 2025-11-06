import * as fs from 'fs';
import * as path from 'path';

export interface Config {
  port: number;
  componentsJsonPath: string;
  flowTemplatesPath: string;
  docsPath: string;
  databasePath: string;
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    componentsJsonPath: process.env.COMPONENTS_JSON_PATH || path.join(__dirname, '..', 'data', 'components.json'),
    flowTemplatesPath: process.env.FLOW_TEMPLATES_PATH || path.join(__dirname, '..', 'data', 'templates'),
    docsPath: process.env.DOCS_PATH || path.join(__dirname, '..', 'data', 'docs'),
    databasePath: process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'langflow.db'),
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
