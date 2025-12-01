import axios from 'axios';

const BASE_URL = process.env.LANGFLOW_MCP_URL || 'http://localhost:3001';

async function testGetComponentEssentials(componentName: string) {
  const res = await axios.get(`${BASE_URL}/mcp/api/component-essentials/${componentName}`);
  if (!res.data.success) throw new Error('Essentials fetch failed');
  console.log(`[PASS] get_component_essentials: "${componentName}"`);
  console.log(JSON.stringify(res.data.data, null, 2));
}

async function testSearchComponentProperties(componentName: string, query: string) {
  const res = await axios.get(`${BASE_URL}/mcp/api/search-component-properties/${componentName}`, {
    params: { query }
  });
  if (!res.data.success) throw new Error('Property search failed');
  console.log(`[PASS] search_component_properties: "${componentName}" query="${query}"`);
  console.log(JSON.stringify(res.data.data, null, 2));
}

async function main() {
  try {
    await testGetComponentEssentials('OpenAIModel');
    await testGetComponentEssentials('ChatInput');
    await testSearchComponentProperties('OpenAIModel', 'auth');
    await testSearchComponentProperties('ChatOutput', 'output_types');
    console.log('\nAll component essentials/property tests completed.');
  } catch (err) {
    console.error('[FAIL] Test failed:', err);
  }
}

main();