#!/usr/bin/env tsx
/**
 * Test script for API-first flow generation
 * Tests the new LangflowComponentService and LangflowFlowBuilder
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const BASE_URL = `http://localhost:${process.env.PORT || 3001}`;
const LANGFLOW_URL = process.env.LANGFLOW_API_URL || 'http://localhost:7860';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  data?: any;
}

const results: TestResult[] = [];

function logTest(name: string, passed: boolean, error?: string, data?: any) {
  results.push({ name, passed, error, data });
  const icon = passed ? '✅' : '❌';
  console.log(`\n${icon} ${name}`);
  if (error) {
    console.error(`   Error: ${error}`);
  }
  if (data) {
    console.log(`   Data:`, JSON.stringify(data, null, 2));
  }
}

async function runTests() {
  console.log('🚀 Starting API-First Flow Generation Tests\n');
  console.log('='.repeat(60));

  // Test 1: Health check
  try {
    console.log('\n📋 Test 1: Server Health Check');
    const response = await axios.get(`${BASE_URL}/health`);
    const isHealthy = response.data.status === 'ok' && response.data.langflowApiEnabled === true;
    logTest('Server health check', isHealthy, undefined, response.data);
  } catch (error: any) {
    logTest('Server health check', false, error.message);
    console.error('\n⚠️  Server is not running! Start it with: npm start');
    return;
  }

  // Test 2: Search components from Langflow API
  try {
    console.log('\n📋 Test 2: Search Components (API-first)');
    const response = await axios.get(`${BASE_URL}/mcp/api/search`, {
      params: { keyword: 'OpenAI', limit: 3 }
    });
    
    const hasResults = response.data.success && Array.isArray(response.data.data) && response.data.data.length > 0;
    logTest(
      'Search OpenAI components', 
      hasResults,
      hasResults ? undefined : 'No results returned',
      { count: response.data.data?.length || 0, sample: response.data.data?.[0] }
    );
  } catch (error: any) {
    logTest('Search OpenAI components', false, error.response?.data?.error || error.message);
  }

  // Test 3: Get component details from Langflow API
  try {
    console.log('\n📋 Test 3: Get Component Details (API-first)');
    const response = await axios.get(`${BASE_URL}/mcp/api/components/OpenAIModel`);
    
    const hasTemplate = response.data.success && 
                       response.data.data?.template && 
                       typeof response.data.data.template === 'object';
    logTest(
      'Get OpenAIModel template',
      hasTemplate,
      hasTemplate ? undefined : 'Invalid template structure',
      { 
        display_name: response.data.data?.display_name,
        template_fields: hasTemplate ? Object.keys(response.data.data.template).length : 0
      }
    );
  } catch (error: any) {
    logTest('Get OpenAIModel template', false, error.response?.data?.error || error.message);
  }

  // Test 4: Search ChatInput component
  try {
    console.log('\n📋 Test 4: Search ChatInput Component');
    const response = await axios.get(`${BASE_URL}/mcp/api/search`, {
      params: { keyword: 'ChatInput', limit: 1 }
    });
    
    const found = response.data.success && 
                 response.data.data?.length > 0 &&
                 response.data.data[0].name === 'ChatInput';
    logTest('Find ChatInput component', found);
  } catch (error: any) {
    logTest('Find ChatInput component', false, error.response?.data?.error || error.message);
  }

  // Test 5: Search ChatOutput component
  try {
    console.log('\n📋 Test 5: Search ChatOutput Component');
    const response = await axios.get(`${BASE_URL}/mcp/api/search`, {
      params: { keyword: 'ChatOutput', limit: 1 }
    });
    
    const found = response.data.success && 
                 response.data.data?.length > 0 &&
                 response.data.data[0].name === 'ChatOutput';
    logTest('Find ChatOutput component', found);
  } catch (error: any) {
    logTest('Find ChatOutput component', false, error.response?.data?.error || error.message);
  }

  // Test 6: Create minimal test flow (API-first)
  try {
    console.log('\n📋 Test 6: Create Minimal Test Flow (API-first)');
    const response = await axios.post(`${BASE_URL}/mcp/api/test-flow`);
    
    const created = response.data.success && 
                   response.data.data?.flow_id;
    
    if (created) {
      const flowId = response.data.data.flow_id;
      logTest(
        'Create test flow via API', 
        true,
        undefined,
        { 
          flow_id: flowId,
          url: response.data.data.url,
          message: response.data.data.message
        }
      );

      // Test 6b: Verify flow was created in Langflow
      try {
        console.log('\n📋 Test 6b: Verify Flow in Langflow');
        const verifyResponse = await axios.get(`${BASE_URL}/mcp/langflow/flows/${flowId}`);
        const exists = verifyResponse.data.success && verifyResponse.data.data?.id === flowId;
        logTest('Flow exists in Langflow', exists);

        // Test 6c: Open flow in browser (just log the URL)
        if (exists) {
          console.log(`\n🌐 Open this URL to verify flow renders correctly:`);
          console.log(`   ${LANGFLOW_URL}/flow/${flowId}`);
          console.log(`   Expected: Flow should display with ChatInput -> OpenAIModel -> ChatOutput`);
        }
      } catch (error: any) {
        logTest('Flow exists in Langflow', false, error.response?.data?.error || error.message);
      }
    } else {
      logTest('Create test flow via API', false, 'No flow_id in response');
    }
  } catch (error: any) {
    logTest('Create test flow via API', false, error.response?.data?.error || error.message);
  }

  // Test 7: Build custom flow (API-first)
  try {
    console.log('\n📋 Test 7: Build Custom Flow (API-first)');
    const customFlow = {
      name: 'Custom API-First Flow',
      description: 'Custom chatbot built using API-first approach',
      nodes: [
        {
          component: 'ChatInput',
          id: 'input_node',
          position: { x: 100, y: 300 },
          params: {
            input_value: 'Hello!'
          }
        },
        {
          component: 'OpenAIModel',
          id: 'model_node',
          position: { x: 450, y: 300 },
          params: {
            model_name: 'gpt-4o-mini',
            temperature: 0.7
          }
        },
        {
          component: 'ChatOutput',
          id: 'output_node',
          position: { x: 800, y: 300 },
          params: {}
        }
      ],
      connections: [
        { source: 'input_node', target: 'model_node', targetParam: 'input_value' },
        { source: 'model_node', target: 'output_node', targetParam: 'input_value' }
      ]
    };

    const response = await axios.post(`${BASE_URL}/mcp/api/build-flow`, customFlow);
    
    const created = response.data.success && response.data.data?.flow_id;
    
    if (created) {
      const flowId = response.data.data.flow_id;
      logTest(
        'Build custom flow',
        true,
        undefined,
        {
          flow_id: flowId,
          url: response.data.data.url
        }
      );

      console.log(`\n🌐 Open this URL to verify custom flow:`);
      console.log(`   ${LANGFLOW_URL}/flow/${flowId}`);
    } else {
      logTest('Build custom flow', false, 'No flow_id in response');
    }
  } catch (error: any) {
    logTest('Build custom flow', false, error.response?.data?.error || error.message);
  }

  // Test 8: Error handling - Invalid component
  try {
    console.log('\n📋 Test 8: Error Handling - Invalid Component');
    const invalidFlow = {
      name: 'Invalid Flow',
      description: 'Test error handling',
      nodes: [
        {
          component: 'NonExistentComponent',
          id: 'invalid_node',
          position: { x: 100, y: 100 },
          params: {}
        }
      ],
      connections: []
    };

    const response = await axios.post(`${BASE_URL}/mcp/api/build-flow`, invalidFlow);
    logTest('Invalid component error handling', false, 'Should have thrown error but succeeded');
  } catch (error: any) {
    const hasError = error.response?.status === 500 || error.response?.data?.error;
    logTest(
      'Invalid component error handling',
      hasError,
      hasError ? undefined : 'Wrong error response',
      { error: error.response?.data?.error || error.message }
    );
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary\n');
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const percentage = ((passed / total) * 100).toFixed(1);

  console.log(`Total Tests: ${total}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${total - passed} ❌`);
  console.log(`Success Rate: ${percentage}%`);

  if (passed === total) {
    console.log('\n🎉 All tests passed! API-first flow generation is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Review the errors above.');
  }

  console.log('\n' + '='.repeat(60));

  // Exit with appropriate code
  process.exit(passed === total ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
