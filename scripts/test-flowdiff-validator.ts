import { LangflowComponent, LangflowFlow, FlowNode, FlowEdge } from '../src/types.js';
import { FlowValidator } from '../src/services/flowValidator.js';
import { FlowDiffEngine } from '../src/services/flowDiffEngine.js';
import { AddNodeOperation, RemoveNodeOperation } from '../src/types/flowDiff.js';
import process from 'process';

// Dummy catalog for testing
const componentCatalog: Record<string, LangflowComponent> = {
  OpenAIModel: {
    name: 'OpenAIModel',
    display_name: 'OpenAI',
    description: 'Generates text using OpenAI LLMs.',
    category: 'openai',
    parameters: [
      { name: 'model_name', type: 'string', required: true, default: 'gpt-4o-mini' },
      { name: 'api_key', type: 'string', required: true, default: 'OPENAI_API_KEY', password: true },
    ],
    base_classes: [],
    output_types: [],
  },
  File: {
    name: 'File',
    display_name: 'File',
    description: 'File node',
    category: 'utility',
    parameters: [],
    base_classes: [],
    output_types: [],
  },
};

// Helper functions for concise output
function printValidationResult(label: string, result: any) {
  const errors = result.issues.filter((i: any) => i.severity === 'error');
  console.log(`\n=== ${label} ===`);
  if (errors.length === 0) {
    console.log('✅ No errors');
  } else {
    console.log('❌ Errors:');
    errors.forEach((e: any) => {
      console.log(`- [${e.nodeId || ''}] ${e.message}`);
    });
  }
  console.log(`Nodes: ${result.summary.totalNodes}, Edges: ${result.summary.totalEdges}, Errors: ${result.summary.errors}`);
}

function printDiffResult(label: string, result: any) {
  console.log(`\n=== ${label} ===`);
  if (result.errors && result.errors.length > 0) {
    console.log('❌ Errors:');
    result.errors.forEach((e: any) => console.log(`- ${e}`));
  } else {
    console.log('✅ No errors');
  }
  console.log(`Nodes: ${result.flow.data.nodes.length}, Edges: ${result.flow.data.edges.length}, Ops: ${result.operationsApplied}`);
}

// Main test
async function main() {
  const validator = new FlowValidator(componentCatalog);
  const diffEngine = new FlowDiffEngine(componentCatalog, validator);

  // Initial flow
  const flow: LangflowFlow = {
    name: 'Test Flow',
    description: 'A minimal flow for testing',
    data: {
      nodes: [
        {
          id: 'model1',
          type: 'OpenAIModel',
          position: { x: 100, y: 100 },
          data: {
            id: 'model1',
            type: 'OpenAIModel',
            node: {
              template: { model_name: 'gpt-4o-mini', api_key: 'OPENAI_API_KEY' },
              display_name: 'OpenAIModel',
              description: '',
              base_classes: [],
              outputs: [],
            },
          },
        },
      ],
      edges: [],
    },
  };

  // Validate initial flow
  const validation = await validator.validateFlow(flow);
  printValidationResult('Initial Validation', validation);

  // Add a node
  const addNodeOp: AddNodeOperation = {
    type: 'addNode',
    node: {
      id: 'file1',
      type: 'File',
      position: { x: 250, y: 200 },
      data: {
        id: 'file1',
        type: 'File',
        node: {
          template: {},
          display_name: 'File',
          description: '',
          base_classes: [],
          outputs: [],
        },
      },
    },
  };
  const diffResult = await diffEngine.applyDiff({
    flow,
    operations: [addNodeOp],
    validateAfter: true,
  });
  printDiffResult('AddNode Operation', diffResult);

  // Remove a node
  const removeNodeOp: RemoveNodeOperation = {
    type: 'removeNode',
    nodeId: 'model1',
  };
  const diffResult2 = await diffEngine.applyDiff({
    flow: diffResult.flow,
    operations: [removeNodeOp],
    validateAfter: true,
  });
  printDiffResult('RemoveNode Operation', diffResult2);

  // Final validation
  const finalValidation = await validator.validateFlow(diffResult2.flow);
  printValidationResult('Final Validation', finalValidation);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});