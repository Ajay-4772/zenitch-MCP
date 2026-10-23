import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ZenitchServer } from '../src/server.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ExperiencePlanOutputSchema } from '../src/schemas/experience.schema.js';
import { performance } from 'node:perf_hooks';

test('ZenitchServer: initializes with clean defaults', () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  assert.ok(server);
  assert.ok(server.getServerInstance());
});

test('ZenitchServer: lists all 11 registered baseline tools including zenitch_plan_product_experience', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();

  const handler = (internalServer as any)._requestHandlers.get(ListToolsRequestSchema.shape.method.value);
  assert.ok(handler, 'ListTools handler must be registered');

  const result = await handler({ method: 'tools/list', params: {} });
  assert.equal(result.tools.length, 11, 'Baseline server must list exactly 11 tools');

  const toolNames = result.tools.map((t: any) => t.name);
  assert.ok(toolNames.includes('zenitch_ping'));
  assert.ok(toolNames.includes('zenitch_get_system_info'));
  assert.ok(toolNames.includes('zenitch_analyze_product_context'));
  assert.ok(toolNames.includes('zenitch_inspect_project'));
  assert.ok(toolNames.includes('zenitch_evaluate_design_policy'));
  assert.ok(toolNames.includes('zenitch_generate_design_system'));
  assert.ok(toolNames.includes('zenitch_resolve_component'));
  assert.ok(toolNames.includes('zenitch_audit_page_quality'));
  assert.ok(toolNames.includes('zenitch_compare_visual_regression'));
  assert.ok(toolNames.includes('zenitch_evaluate_animation_budget'));
  assert.ok(toolNames.includes('zenitch_plan_product_experience'));

  const pxiTool = result.tools.find((t: any) => t.name === 'zenitch_plan_product_experience');
  assert.ok(pxiTool.description.includes('Use during initial application scaffolding'));
  assert.ok(pxiTool.description.includes('Do NOT use for bug fixes'));
});

test('ZenitchServer: handles zenitch_ping request successfully', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();

  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);
  assert.ok(callHandler, 'CallTool handler must be registered');

  const response = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_ping',
      arguments: {}
    }
  });

  assert.ok(!response.isError);
  const parsedContent = JSON.parse(response.content[0].text);
  assert.equal(parsedContent.success, true);
  assert.equal(parsedContent.data.status, 'HEALTHY');
  assert.equal(parsedContent.data.version, '1.0.0');
});

test('ZenitchServer: handles zenitch_get_system_info request successfully', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();

  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);
  const response = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_get_system_info',
      arguments: {}
    }
  });

  assert.ok(!response.isError);
  const parsedContent = JSON.parse(response.content[0].text);
  assert.equal(parsedContent.success, true);
  assert.equal(parsedContent.data.subsystems.length, 8);
  assert.equal(parsedContent.data.approvalModeActive, true);
});

test('ZenitchServer: returns structured error when schema validation fails', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();

  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);
  const response = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_analyze_product_context',
      arguments: {
        productName: 'Broken Product',
        domain: 'INVALID_DOMAIN_NOT_ALLOWED'
      }
    }
  });

  assert.equal(response.isError, true);
  const parsedContent = JSON.parse(response.content[0].text);
  assert.equal(parsedContent.success, false);
  assert.equal(parsedContent.error.code, 'TOOL_EXECUTION_ERROR');
  assert.ok(parsedContent.error.message.includes('Invalid enum value'));
});

// ============================================================================
// PXI Phase 2 Integration Tests: zenitch_plan_product_experience MCP Tool
// ============================================================================

test('ZenitchServer [PXI]: executes zenitch_plan_product_experience for Scenario A (single dashboard page)', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();
  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

  const start = performance.now();
  const response = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_plan_product_experience',
      arguments: {
        rawPrompt: 'Build a modern e-commerce product performance dashboard.',
        targetFormat: 'single_file_html'
      }
    }
  });
  const latencyMs = performance.now() - start;

  assert.ok(!response.isError);
  const parsed = JSON.parse(response.content[0].text);
  assert.equal(parsed.success, true);

  const plan = parsed.data;
  assert.equal(plan.productName, 'Product Performance Dashboard');
  assert.equal(plan.domain, 'ecommerce');
  assert.equal(plan.derivedComplexity, 'compact');
  assert.equal(plan.candidateViews.length, 1);
  assert.equal(plan.candidateViews[0].id, 'dashboard');
  assert.equal(plan.layoutArchitecture.archetype, 'single_view_drilldown');

  // Verify bounded schema conformity and measured latency
  assert.doesNotThrow(() => ExperiencePlanOutputSchema.parse(plan));
  assert.ok(latencyMs < 250, `MCP tool invocation latency (${latencyMs.toFixed(2)}ms) must be bounded`);
});

test('ZenitchServer [PXI]: executes zenitch_plan_product_experience for Scenario B (multi-workflow portal)', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();
  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

  const response = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_plan_product_experience',
      arguments: {
        rawPrompt: 'Build an e-commerce management portal with products, orders, customers, and analytics.'
      }
    }
  });

  assert.ok(!response.isError);
  const parsed = JSON.parse(response.content[0].text);
  assert.equal(parsed.success, true);

  const plan = parsed.data;
  assert.equal(plan.derivedComplexity, 'expanded');
  assert.ok(plan.candidateViews.length >= 3);
  assert.equal(plan.layoutArchitecture.archetype, 'app_shell_sidebar');

  const viewIds = plan.candidateViews.map((v: any) => v.id);
  assert.ok(viewIds.includes('dashboard'));
  assert.ok(viewIds.includes('products'));
  assert.ok(viewIds.includes('orders'));
  assert.ok(viewIds.includes('customers'));
  assert.doesNotThrow(() => ExperiencePlanOutputSchema.parse(plan));
});

test('ZenitchServer [PXI]: executes zenitch_plan_product_experience for Scenario C (explicit single-file HTML)', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();
  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

  const response = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_plan_product_experience',
      arguments: {
        rawPrompt: 'Build the entire dashboard as a single HTML file.'
      }
    }
  });

  assert.ok(!response.isError);
  const parsed = JSON.parse(response.content[0].text);
  const plan = parsed.data;
  assert.equal(plan.targetFormat, 'single_file_html');
  assert.equal(plan.candidateViews.length, 1);
  assert.ok(plan.formatRationale.includes('single-file'));
});

test('ZenitchServer [PXI]: executes zenitch_plan_product_experience for Scenario D (dark editorial preference)', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();
  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

  const response = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_plan_product_experience',
      arguments: {
        rawPrompt: 'Use a dark editorial design with compact charts for our publishing dispatch.',
        designReference: {
          referenceType: 'explicit_text_instruction',
          surfacePreference: 'dark',
          densityPreference: 'compact',
          keyVisualCharacteristics: ['editorial', 'dark aesthetic', 'compact charts']
        }
      }
    }
  });

  assert.ok(!response.isError);
  const parsed = JSON.parse(response.content[0].text);
  const plan = parsed.data;
  assert.equal(plan.designDirection.recommendedTheme, 'dark');
  assert.equal(plan.designDirection.surfaceTone, 'warm_editorial');
  assert.equal(plan.designDirection.userOverrideApplied, true);
  assert.equal(plan.designDirection.backgroundSurfaceHex, '#1c1917');
});

test('ZenitchServer [PXI]: executes zenitch_plan_product_experience for Scenario E (existing Next.js project)', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();
  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

  const response = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_plan_product_experience',
      arguments: {
        rawPrompt: 'Improve the dashboard in my existing Next.js project.'
      }
    }
  });

  assert.ok(!response.isError);
  const parsed = JSON.parse(response.content[0].text);
  const plan = parsed.data;
  assert.equal(plan.targetFormat, 'framework_app');
  assert.ok(plan.formatRationale.includes('Next.js'));
});

test('ZenitchServer [PXI]: handles ambiguous prompt safely with bounded single-view fallback', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();
  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

  const response = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_plan_product_experience',
      arguments: {
        rawPrompt: 'make an app'
      }
    }
  });

  assert.ok(!response.isError);
  const parsed = JSON.parse(response.content[0].text);
  const plan = parsed.data;
  assert.equal(plan.derivedComplexity, 'compact');
  assert.equal(plan.candidateViews.length, 1);
  assert.ok(plan.inferredAssumptions.length > 0);
});

test('ZenitchServer [PXI]: safely handles non-existent paths, traversal attempts, and file-as-directory', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();
  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

  // 1. Non-existent path
  const nonExistentRes = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_plan_product_experience',
      arguments: {
        rawPrompt: 'Create a metrics dashboard',
        projectRoot: 'C:\\this\\path\\does\\not\\exist\\at\\all'
      }
    }
  });
  assert.ok(!nonExistentRes.isError);
  const nonExistentPlan = JSON.parse(nonExistentRes.content[0].text).data;
  assert.ok(nonExistentPlan.inferredAssumptions.some((a: string) => a.includes('does not exist')));

  // 2. Traversal attempt
  const traversalRes = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_plan_product_experience',
      arguments: {
        rawPrompt: 'Create a metrics dashboard',
        projectRoot: '../../../../../../../../../../nonexistent_traversal'
      }
    }
  });
  assert.ok(!traversalRes.isError);

  // 3. File path passed as directory
  const fileRes = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_plan_product_experience',
      arguments: {
        rawPrompt: 'Create a metrics dashboard',
        projectRoot: path.join(process.cwd(), 'package.json')
      }
    }
  });
  assert.ok(!fileRes.isError);
  const filePlan = JSON.parse(fileRes.content[0].text).data;
  assert.ok(filePlan.inferredAssumptions.some((a: string) => a.includes('resolves to a file')));
});

test('ZenitchServer [PXI]: returns structured MCP error on invalid schema input', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();
  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

  // Short prompt (< 3 characters)
  const response = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_plan_product_experience',
      arguments: {
        rawPrompt: 'ab'
      }
    }
  });

  assert.equal(response.isError, true);
  const parsed = JSON.parse(response.content[0].text);
  assert.equal(parsed.success, false);
  assert.equal(parsed.error.code, 'TOOL_EXECUTION_ERROR');
  assert.ok(parsed.error.message.includes('Prompt must describe the intended application'));
});

test('ZenitchServer [PXI]: measures output payload size and token bounding', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();
  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

  const response = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_plan_product_experience',
      arguments: {
        rawPrompt: 'Build a modern e-commerce product performance dashboard.'
      }
    }
  });

  assert.ok(!response.isError);
  const payloadString = response.content[0].text;
  const payloadBytes = Buffer.byteLength(payloadString, 'utf8');
  // Approximate tokens ~ bytes / 4
  const approxTokens = Math.round(payloadBytes / 4);

  console.log(`\n--- PXI MCP Output Payload Bounding ---`);
  console.log(`Output Payload Size: ${payloadBytes} bytes (~${approxTokens} tokens)`);
  console.log(`---------------------------------------\n`);

  assert.ok(payloadBytes < 8000, `Standard output payload (${payloadBytes} bytes) must be bounded < 8KB`);
  assert.ok(approxTokens < 2000, `Estimated token size (~${approxTokens}) must be bounded < 2000 tokens`);
});
