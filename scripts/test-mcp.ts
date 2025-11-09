import { spawn } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Add debug flag
const DEBUG = process.env.DEBUG === 'true';

interface MCPRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: any;
}

/**
 * Send a request to the MCP server and get response
 */
async function sendMCPRequest(request: MCPRequest): Promise<MCPResponse> {
  const serverPath = path.join(__dirname, '..', 'dist', 'api', 'mcp-server.js');
  
  return new Promise((resolve, reject) => {
    const child = spawn('node', [serverPath]);
    let stdoutData = '';
    let stderrData = '';
    let responseParsed = false;

    // Collect stdout (JSON-RPC responses only)
    child.stdout.on('data', (data) => {
      stdoutData += data.toString();
      
      if (DEBUG) {
        console.log('📤 Raw stdout:', data.toString());
      }
      
      // Try to parse each line as JSON-RPC
      const lines = stdoutData.split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line && line.startsWith('{')) {
          try {
            const response = JSON.parse(line);
            if (response.jsonrpc === '2.0' && response.id === request.id) {
              responseParsed = true;
              child.kill();
              resolve(response);
              return;
            }
          } catch (e) {
            if (DEBUG) {
              console.log('⚠️  Failed to parse line:', line);
            }
          }
        }
      }
      // Keep the last incomplete line
      stdoutData = lines[lines.length - 1];
    });

    // Collect stderr (logs)
    child.stderr.on('data', (data) => {
      stderrData += data.toString();
      if (DEBUG) {
        console.error('📋 Server log:', data.toString());
      }
    });

    // Handle process exit
    child.on('close', (code) => {
      if (!responseParsed) {
        if (code !== 0) {
          console.error('❌ Server stderr:', stderrData);
          reject(new Error(`Process exited with code ${code}`));
        } else {
          reject(new Error('No valid JSON-RPC response received'));
        }
      }
    });

    // Handle errors
    child.on('error', (error) => {
      reject(error);
    });

    // Send request
    if (DEBUG) {
      console.log('📨 Sending request:', JSON.stringify(request, null, 2));
    }
    child.stdin.write(JSON.stringify(request) + '\n');
    child.stdin.end();
  });
}

/**
 * Test helper with colored output
 */
async function runTest(
  name: string,
  request: MCPRequest,
  validator?: (response: MCPResponse) => void
): Promise<boolean> {
  try {
    console.log(`\n🧪 Testing: ${name}`);
    const response = await sendMCPRequest(request);

    if (DEBUG) {
      console.log('📥 Full response:', JSON.stringify(response, null, 2));
    }

    if (response.error) {
      console.error(`❌ Failed: ${response.error.message || JSON.stringify(response.error)}`);
      return false;
    }

    if (validator) {
      validator(response);
    }

    console.log(`✅ Passed: ${name}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Main test suite
 */
async function runTests() {
  console.log('🚀 Starting Langflow MCP Server Tests\n');
  console.log('=' .repeat(60));
  
  if (DEBUG) {
    console.log('🐛 DEBUG MODE ENABLED\n');
  }

  const results: { name: string; passed: boolean }[] = [];

  // Test 1: List Tools
  const test1 = await runTest(
    'List Tools (tools/list)',
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    },
    (response) => {
      const tools = response.result?.tools;
      if (!Array.isArray(tools)) {
        throw new Error('Expected tools array in result');
      }
      console.log(`   📦 Found ${tools.length} tools:`);
      tools.forEach((tool: any) => {
        console.log(`      • ${tool.name}: ${tool.description}`);
      });
      
      // Verify expected tools exist
      const expectedTools = ['search_components', 'get_component', 'list_categories'];
      const toolNames = tools.map((t: any) => t.name);
      expectedTools.forEach(name => {
        if (!toolNames.includes(name)) {
          throw new Error(`Missing expected tool: ${name}`);
        }
      });
    }
  );
  results.push({ name: 'List Tools', passed: test1 });

  // Test 2: Search Components (simple)
  const test2 = await runTest(
    'Search Components - Simple Query',
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'search_components',
        arguments: { query: 'openai', limit: 5 },
      },
    },
    (response) => {
      const content = response.result?.content?.[0]?.text;
      if (!content) {
        throw new Error('No content in response');
      }
      const components = JSON.parse(content);
      console.log(`   📦 Found ${components.length} OpenAI components:`);
      components.forEach((comp: any) => {
        console.log(`      • ${comp.name} (${comp.category})`);
      });
    }
  );
  results.push({ name: 'Search Components (Simple)', passed: test2 });

  // Test 3: Search Components (with category)
  const test3 = await runTest(
    'Search Components - Category Filter',
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'search_components',
        arguments: { category: 'models', limit: 3 },
      },
    },
    (response) => {
      const content = response.result?.content?.[0]?.text;
      if (!content) {
        throw new Error('No content in response');
      }
      const components = JSON.parse(content);
      console.log(`   📦 Found ${components.length} model components:`);
      components.forEach((comp: any) => {
        console.log(`      • ${comp.name}: ${comp.display_name}`);
        if (comp.category !== 'models') {
          throw new Error(`Expected category 'models', got '${comp.category}'`);
        }
      });
    }
  );
  results.push({ name: 'Search Components (Category)', passed: test3 });

  // Test 4: Get Specific Component - First find one that exists!
  const test4Setup = await sendMCPRequest({
    jsonrpc: '2.0',
    id: 999,
    method: 'tools/call',
    params: {
      name: 'search_components',
      arguments: { category: 'agents', limit: 1 },
    },
  });
  
  const setupContent = test4Setup.result?.content?.[0]?.text;
  const availableComponents = setupContent ? JSON.parse(setupContent) : [];
  const testComponentName = availableComponents[0]?.name || 'Agent';
  
  console.log(`\n🔍 Using component "${testComponentName}" for get_component test`);

  const test4 = await runTest(
    `Get Component - ${testComponentName}`,
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'get_component',
        arguments: { name: testComponentName },
      },
    },
    (response) => {
      const content = response.result?.content?.[0]?.text;
      if (!content) {
        throw new Error('No content in response');
      }
      
      const data = JSON.parse(content);
      
      // THIS IS THE FIX - Check if it's an error response
      if (data.error) {
        throw new Error(`Expected component to exist but got error: ${data.error}`);
      }
      
      // Validate it's actually a component
      if (!data.name || !data.category) {
        throw new Error('Response missing required component fields (name, category)');
      }
      
      console.log(`   📦 Component Details:`);
      console.log(`      • Name: ${data.name}`);
      console.log(`      • Display: ${data.display_name}`);
      console.log(`      • Category: ${data.category}`);
      console.log(`      • Parameters: ${data.parameters?.length || 0}`);
      
      if (data.name !== testComponentName) {
        throw new Error(`Expected component '${testComponentName}', got '${data.name}'`);
      }
    }
  );
  results.push({ name: 'Get Component (Valid)', passed: test4 });

  // Test 5: Get Non-Existent Component (should error)
  const test5 = await runTest(
    'Get Component - Non-Existent (Error Handling)',
    {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'get_component',
        arguments: { name: 'NonExistentComponent12345' },
      },
    },
    (response) => {
      const content = response.result?.content?.[0]?.text;
      if (!content) {
        throw new Error('No content in response');
      }
      
      const data = JSON.parse(content);
      
      // THIS SHOULD have an error
      if (!data.error) {
        throw new Error('Expected error response for non-existent component');
      }
      
      console.log(`   ✅ Correctly returned error: ${data.error}`);
    }
  );
  results.push({ name: 'Get Component (Error)', passed: test5 });

  // Test 6: List Categories
  const test6 = await runTest(
    'List Categories',
    {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'list_categories',
        arguments: {},
      },
    },
    (response) => {
      const content = response.result?.content?.[0]?.text;
      if (!content) {
        throw new Error('No content in response');
      }
      const categories = JSON.parse(content);
      console.log(`   📦 Found ${categories.length} categories:`);
      console.log(`      ${categories.slice(0, 10).join(', ')}...`);
      
      if (!Array.isArray(categories) || categories.length === 0) {
        throw new Error('Expected non-empty array of categories');
      }
    }
  );
  results.push({ name: 'List Categories', passed: test6 });

  // Test 7: Search with Tool Mode Filter
  const test7 = await runTest(
    'Search Components - Tool Mode Filter',
    {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'search_components',
        arguments: { tool_mode: true, limit: 5 },
      },
    },
    (response) => {
      const content = response.result?.content?.[0]?.text;
      if (!content) {
        throw new Error('No content in response');
      }
      const components = JSON.parse(content);
      console.log(`   📦 Found ${components.length} tool-mode components`);
      
      if (components.length === 0) {
        console.log(`   ℹ️  No tool-mode components in dataset (expected)`);
      } else {
        components.forEach((comp: any) => {
          if (!comp.tool_mode) {
            throw new Error(`Component ${comp.name} should have tool_mode: true`);
          }
        });
      }
    }
  );
  results.push({ name: 'Search Components (Tool Mode)', passed: test7 });

  // Test 8: Invalid Tool Name (should error)
  const test8 = await runTest(
    'Invalid Tool Name (Error Handling)',
    {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'invalid_tool_name',
        arguments: {},
      },
    },
    (response) => {
      const content = response.result?.content?.[0]?.text;
      if (!content) {
        throw new Error('No content in response');
      }
      
      const data = JSON.parse(content);
      
      // THIS SHOULD have an error
      if (!data.error) {
        throw new Error('Expected error response for invalid tool name');
      }
      
      console.log(`   ✅ Correctly rejected invalid tool name`);
      console.log(`   💡 Error: ${data.error}`);
    }
  );
  results.push({ name: 'Invalid Tool Name', passed: test8 });

  // Print Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary\n');
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
  });
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n🎯 Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed!\n');
    process.exit(0);
  } else {
    console.log(`⚠️  ${total - passed} test(s) failed\n`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('💥 Test suite crashed:', error);
  process.exit(1);
});