import axios from 'axios';

const BASE_URL = process.env.LANGFLOW_MCP_URL || 'http://localhost:3001';

async function testSearchTemplates() {
  const params = {
    keyword: 'chat',
    page: 1,
    pageSize: 5,
  };
  const res = await axios.get(`${BASE_URL}/mcp/api/search-templates`, { params });
  console.log('Search Templates:', JSON.stringify(res.data, null, 2));
  const first = res.data.results?.[0];
  if (!first) throw new Error('No templates found for keyword.');
  return first.id;
}

async function testGetTemplate(flowId: string) {
  const res = await axios.get(`${BASE_URL}/mcp/api/get-template/${flowId}`);
  console.log('Get Template:', JSON.stringify(res.data, null, 2));
}

async function testTweakTemplate(flowId: string) {
  const tweaks = {
    // Example: change prompt for a node (update nodeId as needed)
    'chat_input_1': { prompt: 'Hello, world!' },
  };
  const body = {
    tweaks,
    saveAsNew: true,
    newName: 'Tweaked Chatbot',
    newDescription: 'Chatbot with custom prompt',
  };
  try {
    const res = await axios.post(`${BASE_URL}/mcp/api/tweak-template/${flowId}`, body);
    console.log('Tweak Template:', JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error('Tweak Template failed:', err?.response?.data || err);
  }
}

async function testRunTemplateWithTweaks(flowId: string) {
  const body = {
    input: { text: 'Test message' },
    tweaks: {
      'chat_input_1': { prompt: 'Test prompt' },
    },
  };
  try {
    const res = await axios.post(`${BASE_URL}/mcp/api/run-template/${flowId}`, body);
    console.log('Run Template With Tweaks:', JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error('Run Template With Tweaks failed:', err?.response?.data || err);
  }
}

async function main() {
  try {
    const flowId = await testSearchTemplates();
    await testGetTemplate(flowId);
    await testTweakTemplate(flowId);
    await testRunTemplateWithTweaks(flowId);
  } catch (err) {
    console.error('Test failed:', err);
  }
}

main();
