import axios from 'axios';

const BASE_URL = process.env.LANGFLOW_MCP_URL || 'http://localhost:3001';

async function testSearchTemplates() {
  const params = { keyword: 'chat', page: 1, pageSize: 5 };
  const res = await axios.get(`${BASE_URL}/mcp/api/search-templates`, { params });
  const first = res.data.results?.[0];
  if (!first) throw new Error('No templates found for keyword.');
  console.log(`[PASS] Search Templates: Found ${res.data.total} templates. Using "${first.name}" (${first.id})`);
  return first.id;
}

async function testGetTemplate(templateId: string) {
  const res = await axios.get(`${BASE_URL}/mcp/api/get-template/${templateId}`);
  const { name, description } = res.data;
  console.log(`[PASS] Get Template: "${name}" - ${description?.slice(0, 60)}...`);
}

async function testCreateFlowFromTemplate(templateId: string) {
  const body = {
    name: 'Test Flow',
    description: 'Created from template for testing'
  };
  const res = await axios.post(`${BASE_URL}/mcp/api/create-flow-from-template/${templateId}`, body);
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
  const output = res.data.outputs?.[0]?.results?.message?.text || '[No output]';
  console.log(`[PASS] Run Flow: Output: "${output.slice(0, 80)}..."`);
}

async function testListComponents() {
  const res = await axios.get(`${BASE_URL}/mcp/api/search`);
  console.log('[PASS] List Components:', res.data);
}

async function main() {
  try {
    await testListComponents();
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