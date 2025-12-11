import { LangflowApiService } from './src/services/langflowApiService.js';
import { LangflowComponentService } from './src/services/LangflowComponentService.js';
import { FlowDiffEngine } from './src/services/flowDiffEngine.js';
import { FlowValidator } from './src/services/flowValidator.js';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * DIAGNOSTIC TEST: Template Update Path Tracing
 * 
 * This test will show EXACTLY where the template value gets lost:
 * 1. Initial flow state
 * 2. After applyDiff (in-memory)
 * 3. Request payload to Langflow API
 * 4. Response from Langflow API
 * 5. Final downloaded flow state
 */
async function diagnoseTemplateUpdate() {
  const apiUrl = process.env.LANGFLOW_API_URL || 'http://localhost:7860';
  const apiKey = process.env.LANGFLOW_API_KEY || '';

  const client = new LangflowApiService(apiUrl, apiKey);
  const componentService = new LangflowComponentService(client);

  console.log('=== STEP 1: CREATE TEST FLOW ===\n');
  
  // Create a simple flow with a Prompt component
  const createResponse = await client.createFlow({
    name: 'Template Update Test',
    description: 'Testing template update path',
    data: {
      nodes: [
        {
          id: 'test-prompt',
          type: 'genericNode',
          position: { x: 100, y: 100 },
          data: {
            id: 'test-prompt',
            type: 'Prompt',
            node: {
              template: {
                template: {
                  _input_type: 'PromptInput',
                  value: 'Original prompt text'
                }
              },
              display_name: 'Prompt',
              description: 'Test prompt',
              base_classes: ['Message'],
              outputs: []
            }
          }
        }
      ],
      edges: []
    }
  });

  const flowId = createResponse.id;
  console.log(`✅ Created flow: ${flowId}\n`);

  console.log('=== STEP 2: GET INITIAL STATE ===\n');
  const initialFlow = await client.getFlow(flowId);
  const initialPromptNode = initialFlow.data.nodes.find((n: any) => n.id === 'test-prompt');
  console.log('Initial template value:', initialPromptNode?.data?.node?.template?.template?.value);
  console.log('Full initial node structure:', JSON.stringify(initialPromptNode, null, 2));
  console.log('\n');

  console.log('=== STEP 3: PREPARE UPDATE OPERATION ===\n');
  const updateOperation = {
    type: 'updateNode' as const,
    nodeId: 'test-prompt',
    updates: {
      template: {
        template: 'YOU ARE MICHAEL JACKSON! HEE-HEE! 🎤'
      }
    },
    merge: true
  };
  console.log('Operation:', JSON.stringify(updateOperation, null, 2));
  console.log('\n');

  console.log('=== STEP 4: APPLY DIFF (IN-MEMORY) ===\n');
  const rawCatalog = await componentService.getAllComponents();
  const flatCatalog: Record<string, any> = {};
  for (const category in rawCatalog) {
    for (const name in rawCatalog[category]) {
      flatCatalog[name] = rawCatalog[category][name];
    }
  }

  const diffEngine = new FlowDiffEngine(
    flatCatalog,
    new FlowValidator(flatCatalog)
  );

  const diffResult = await diffEngine.applyDiff({
    flow: initialFlow,
    operations: [updateOperation],
    validateAfter: false,
    continueOnError: false
  });

  if (!diffResult.success) {
    console.error('❌ Diff failed:', diffResult.errors);
    return;
  }

  const updatedPromptNode = diffResult.flow.data.nodes.find((n: any) => n.id === 'test-prompt');
  console.log('✅ After applyDiff (in-memory):');
  console.log('  Template value:', updatedPromptNode?.data?.node?.template?.template?.value);
  console.log('  Full node structure:', JSON.stringify(updatedPromptNode?.data?.node?.template, null, 2));
  console.log('\n');

  console.log('=== STEP 5: PREPARE API REQUEST ===\n');
  const apiRequestPayload = {
    name: diffResult.flow.name,
    description: diffResult.flow.description,
    data: diffResult.flow.data,
    tags: diffResult.flow.tags || [],
    is_component: diffResult.flow.is_component || false
  };

  const requestPromptNode = apiRequestPayload.data.nodes.find((n: any) => n.id === 'test-prompt');
  console.log('Request payload template value:', requestPromptNode?.data?.node?.template?.template?.value);
  console.log('Request payload size:', JSON.stringify(apiRequestPayload).length, 'bytes');
  console.log('\n');

  console.log('=== STEP 6: SEND TO LANGFLOW API ===\n');
  
  // Manually intercept the API call to see exactly what's sent
  const originalPatch = (client as any).client.patch.bind((client as any).client);
  let requestData: any = null;
  let responseData: any = null;

  (client as any).client.patch = async function(url: string, data: any) {
    console.log('📤 PATCH Request:');
    console.log('  URL:', url);
    console.log('  Payload template value:', data.data?.nodes?.find((n: any) => n.id === 'test-prompt')?.data?.node?.template?.template?.value);
    requestData = data;
    
    const response = await originalPatch(url, data);
    
    console.log('📥 PATCH Response:');
    console.log('  Status:', response.status);
    console.log('  Template value:', response.data?.data?.nodes?.find((n: any) => n.id === 'test-prompt')?.data?.node?.template?.template?.value);
    responseData = response.data;
    
    return response;
  };

  await client.updateFlow(flowId, diffResult.flow);
  console.log('\n');

  console.log('=== STEP 7: DOWNLOAD FLOW (VERIFY) ===\n');
  const finalFlow = await client.getFlow(flowId);
  const finalPromptNode = finalFlow.data.nodes.find((n: any) => n.id === 'test-prompt');
  console.log('✅ Downloaded flow template value:', finalPromptNode?.data?.node?.template?.template?.value);
  console.log('\n');

  console.log('=== DIAGNOSTIC SUMMARY ===\n');
  console.log('1. Initial value:   ', initialPromptNode?.data?.node?.template?.template?.value);
  console.log('2. After applyDiff: ', updatedPromptNode?.data?.node?.template?.template?.value);
  console.log('3. In API request:  ', requestData?.data?.nodes?.find((n: any) => n.id === 'test-prompt')?.data?.node?.template?.template?.value);
  console.log('4. In API response: ', responseData?.data?.nodes?.find((n: any) => n.id === 'test-prompt')?.data?.node?.template?.template?.value);
  console.log('5. Final downloaded:', finalPromptNode?.data?.node?.template?.template?.value);
  console.log('\n');

  if (finalPromptNode?.data?.node?.template?.template?.value === 'YOU ARE MICHAEL JACKSON! HEE-HEE! 🎤') {
    console.log('✅ ✅ ✅ UPDATE SUCCEEDED! ✅ ✅ ✅');
  } else {
    console.log('❌ ❌ ❌ UPDATE FAILED! ❌ ❌ ❌');
    console.log('\n=== WHERE DID IT FAIL? ===');
    if (updatedPromptNode?.data?.node?.template?.template?.value !== 'YOU ARE MICHAEL JACKSON! HEE-HEE! 🎤') {
      console.log('🔴 Failed in applyDiff (flowDiffEngine.ts)');
    } else if (requestData?.data?.nodes?.find((n: any) => n.id === 'test-prompt')?.data?.node?.template?.template?.value !== 'YOU ARE MICHAEL JACKSON! HEE-HEE! 🎤') {
      console.log('🔴 Failed when preparing API request (langflowApiService.ts)');
    } else if (responseData?.data?.nodes?.find((n: any) => n.id === 'test-prompt')?.data?.node?.template?.template?.value !== 'YOU ARE MICHAEL JACKSON! HEE-HEE! 🎤') {
      console.log('🔴 Failed in Langflow API response (server-side issue)');
    } else {
      console.log('🔴 Failed when downloading flow (langflowApiService.ts getFlow)');
    }
  }

  // Cleanup
  console.log('\n=== CLEANUP ===');
  console.log(`To delete test flow: DELETE ${apiUrl}/api/v1/flows/${flowId}`);
}

diagnoseTemplateUpdate().catch(console.error);