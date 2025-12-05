import { LangflowComponent, LangflowFlow, FlowNode, FlowEdge } from '../src/types.js';
import { FlowValidator } from '../src/services/flowValidator.js';
import { FlowDiffEngine } from '../src/services/flowDiffEngine.js';
import { AddNodeOperation, RemoveNodeOperation } from '../src/types/flowDiff.js';
import { LangflowFlowBuilder } from '../src/services/LangflowFlowBuilder.js';
import { LangflowApiService } from '../src/services/langflowApiService.js';
import { LangflowComponentService } from '../src/services/LangflowComponentService.js';

import axios from 'axios';

// Set your MCP API base URL
const BASE_URL = process.env.LANGFLOW_MCP_URL || 'http://localhost:3001';

// Helper for concise output
function printResult(label: string, result: any) {
  console.log(`\n=== ${label} ===`);
  if (result.success) {
    console.log('✅ Success');
    if (result.flow) {
      console.log(`Nodes: ${result.flow.data.nodes.length}, Edges: ${result.flow.data.edges.length}`);
    }
    if (result.operationsApplied !== undefined) {
      console.log(`Operations Applied: ${result.operationsApplied}`);
    }
    if (result.warnings && result.warnings.length > 0) {
      console.log('Warnings:');
      result.warnings.forEach((w: any) => console.log(`- ${w}`));
    }
  } else {
    console.log('❌ Failed');
    if (result.errors && result.errors.length > 0) {
      result.errors.forEach((e: any) => console.log(`- ${e}`));
    }
  }
}

async function getFirstComponent() {
  const res = await axios.get(`${BASE_URL}/mcp/api/search?keyword=a`);
  const catalog = res.data.data;
  for (const category in catalog) {
    const components = catalog[category];
    for (const name in components) {
      // Fetch full details for this component
      const detailsRes = await axios.get(`${BASE_URL}/mcp/api/components/${name}`);
      const component = detailsRes.data.data;
      if (component.template && typeof component.template === 'object') {
        if (!component.name) component.name = name;
        return component;
      }
    }
  }
  throw new Error('No components with a valid template found in catalog');
}

// Main test
async function main() {
  // 1. Create a minimal flow for testing
  const createRes = await axios.post(`${BASE_URL}/mcp/api/test-flow`, {});
  const flowId = createRes.data.data.flow_id;
  console.log(`Created test flow: ${flowId}`);

  // 2. Get a valid component from the catalog
  const component = await getFirstComponent();

  // 3. Build a valid node using LangflowFlowBuilder
  const apiClient = new LangflowApiService(BASE_URL, process.env.LANGFLOW_API_KEY || '');
  const componentService = new LangflowComponentService(apiClient);
  const flowBuilder = new LangflowFlowBuilder(componentService, apiClient);

  // Fill required/default parameters if needed
  const node = await flowBuilder.buildNode(
    component.name,
    'test_node_1',
    { x: 250, y: 200 },
    {} // You can pass required params here
  );

  const addNodeOp = {
    type: 'addNode',
    node
  };

  const tweakRes1 = await axios.post(`${BASE_URL}/mcp/api/tweak-flow/${flowId}`, {
    operations: [addNodeOp],
    validateAfter: true,
  });
  printResult('AddNode Operation', tweakRes1.data);

  // 4. Tweak flow: Remove a node
  const removeNodeOp = {
    type: 'removeNode',
    nodeId: 'chat_input_1', // Remove the ChatInput node
  };
  const tweakRes2 = await axios.post(`${BASE_URL}/mcp/api/tweak-flow/${flowId}`, {
    operations: [removeNodeOp],
    validateAfter: true,
  });
  printResult('RemoveNode Operation', tweakRes2.data);

  // 5. Tweak flow: Update a node parameter
  const updateNodeOp = {
    type: 'updateNode',
    nodeId: 'openai_1',
    updates: {
      template: { temperature: 0.7 },
    },
    merge: true,
  };
  const tweakRes3 = await axios.post(`${BASE_URL}/mcp/api/tweak-flow/${flowId}`, {
    operations: [updateNodeOp],
    validateAfter: true,
  });
  printResult('UpdateNode Operation', tweakRes3.data);

  // 6. Validate the final flow
  const validateRes = await axios.get(`${BASE_URL}/mcp/api/validate-flow/${flowId}`);
  printResult('Final Validation', validateRes.data);

  console.log('\nAll flow diff/refactor tests completed.');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});