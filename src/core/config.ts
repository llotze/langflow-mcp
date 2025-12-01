import dotenv from 'dotenv';

export interface Config {
  port: number;
  langflowApiUrl?: string;
  langflowApiKey?: string;
}

export function loadConfig(): Config {
  dotenv.config();

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    langflowApiUrl: process.env.LANGFLOW_API_URL,
    langflowApiKey: process.env.LANGFLOW_API_KEY,
  };
}