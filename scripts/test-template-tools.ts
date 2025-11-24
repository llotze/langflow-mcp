import axios from 'axios';

const BASE_URL = process.env.LANGFLOW_MCP_URL || 'http://localhost:3001';

async function testSearchTemplates() {
  const params = { keyword: 'chat', page: 1, pageSize: 5 };
  const res = await axios.get(`${BASE_URL}/mcp/api/search-templates`, { params });
  console.log('[DEBUG] Search Templates Response:', JSON.stringify(res.data, null, 2));
  const first = res.data.results?.[0];
  if (!first) throw new Error('No templates found for keyword.');
  console.log(`[PASS] Search Templates: Found ${res.data.total} templates. Using "${first.name}" (${first.id})`);
  return first.id;
}

async function testGetTemplate(templateId: string) {
  const res = await axios.get(`${BASE_URL}/mcp/api/get-template/${templateId}`);
  console.log('[DEBUG] Get Template Response:', JSON.stringify(res.data, null, 2));
  const { name, description } = res.data;
  console.log(`[PASS] Get Template: "${name}" - ${description?.slice(0, 60)}...`);
}

async function testCreateFlowFromTemplate(templateId: string) {
  const body = {
    name: 'Test Flow',
    description: 'Created from template for testing'
  };
  const res = await axios.post(`${BASE_URL}/mcp/api/create-flow-from-template/${templateId}`, body);
  console.log('[DEBUG] Create Flow From Template Response:', JSON.stringify(res.data, null, 2));
  const { success, flow } = res.data;
  if (!success) throw new Error('Flow creation failed');
  console.log(`[PASS] Create Flow From Template: "${flow?.name}" (${flow?.id})`);
  return flow?.id;
}

async function testTweakFlow(flowId: string) {
  // Example tweaks: update the prompt of a node (replace with actual nodeId and param)
  const tweaks = { /* nodeId: { param: value } */ };
  const body = {
    tweaks,
    newName: 'Tweaked Flow',
    newDescription: 'Flow with custom tweaks',
  };
  const res = await axios.post(`${BASE_URL}/mcp/api/tweak-flow/${flowId}`, body);
  console.log('[DEBUG] Tweak Flow Response:', JSON.stringify(res.data, null, 2));
  const { success, flow } = res.data;
  if (!success) throw new Error('Tweak failed');
  console.log(`[PASS] Tweak Flow: Updated flow "${flow?.name}" (${flow?.id})`);
  return flow?.id;
}

async function testRunFlow(flowId: string) {
  const body = {
    input: { text: 'Test message' },
  };
  const res = await axios.post(`${BASE_URL}/mcp/api/run-flow/${flowId}`, body);
  console.log('[DEBUG] Run Flow Response:', JSON.stringify(res.data, null, 2));
  const output = res.data.outputs?.[0]?.results?.message?.text || '[No output]';
  console.log(`[PASS] Run Flow: Output: "${output.slice(0, 80)}..."`);
}

async function testListComponents() {
  const res = await axios.get(`${BASE_URL}/mcp/api/search`);
  console.log('[DEBUG] List Components Response:', JSON.stringify(res.data, null, 2));
  console.log('[PASS] List Components:', res.data);
}

async function testGetComponentEssentials(componentName: string) {
  const res = await axios.get(`${BASE_URL}/mcp/api/component-essentials/${componentName}`);
  console.log(`[DEBUG] get_component_essentials: "${componentName}"`, JSON.stringify(res.data, null, 2));
  if (!res.data.success) throw new Error('Essentials fetch failed');
  console.log(`[PASS] get_component_essentials: "${componentName}"`);
}

async function testSearchComponentProperties(componentName: string, query: string) {
  const res = await axios.get(`${BASE_URL}/mcp/api/search-component-properties/${componentName}`, {
    params: { query }
  });
  console.log(`[DEBUG] search_component_properties: "${componentName}" query="${query}"`, JSON.stringify(res.data, null, 2));
  if (!res.data.success) throw new Error('Property search failed');
  console.log(`[PASS] search_component_properties: "${componentName}" query="${query}"`);
}

async function main() {
  try {
    await testListComponents();
    await testGetComponentEssentials('OpenAIModel');
    await testGetComponentEssentials('ChatInput');
    await testSearchComponentProperties('OpenAIModel', 'auth');
    await testSearchComponentProperties('ChatOutput', 'output_types');
    // Only run MemoryBuffer if you know it exists
    // await testSearchComponentProperties('MemoryBuffer', 'memory');
    const templateId = await testSearchTemplates();
    await testGetTemplate(templateId);
    const flowId = await testCreateFlowFromTemplate(templateId);
    const tweakedFlowId = await testTweakFlow(flowId);
    await testRunFlow(tweakedFlowId);
    console.log('\nAll flow tool tests completed.');
  } catch (err) {
    console.error('[FAIL] Test failed:', err);
  }
}

main();