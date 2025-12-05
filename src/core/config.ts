import dotenv from 'dotenv';

/**
 * Server configuration loaded from environment variables.
 */
export interface Config {
  port: number;
  langflowApiUrl?: string;
  langflowApiKey?: string;
}

/**
 * Loads configuration from .env file and environment variables.
 */
export function loadConfig(): Config {
  dotenv.config();

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    langflowApiUrl: process.env.LANGFLOW_API_URL,
    langflowApiKey: process.env.LANGFLOW_API_KEY,
  };
}