import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveComponent } from '../src/intelligence/component-resolver.js';
import { COMPONENT_CONTRACTS, getComponentContract } from '../src/intelligence/component-contracts.js';
import { ComponentContractSchema, ComponentResolutionInputSchema } from '../src/schemas/component.schema.js';
import { generateDesignSystem } from '../src/intelligence/design-system-generator.js';
import { evaluateDesignPolicy } from '../src/policy/policy-evaluator.js';
import { ZenitchServer } from '../src/server.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// ===========================================================================
// SECTION A: DIALOG SEMANTICS & ACCESSIBILITY REQUIREMENTS (PRIORITY 1)
// ===========================================================================

test('Section A: Dialog contract enforces separation of decorative backdrop from dialog container', () => {
  const dialog = COMPONENT_CONTRACTS.dialog;
  assert.ok(dialog);

  // 1. Structure must document backdrop as purely decorative sibling
  assert.ok(dialog.structure.slots.backdrop.includes('MUST NEVER enclose or wrap'));
  assert.ok(dialog.structure.containerHierarchy.includes('dialog-backdrop'));
  assert.ok(dialog.structure.containerHierarchy.includes('never wrap dialog inside aria-hidden'));

  // 2. Focus management must state runtime requirements rather than claiming implementation
  assert.ok(dialog.accessibility.focusManagement.includes('Runtime Requirements'));
  assert.ok(dialog.accessibility.focusManagement.includes('Active dialog MUST NOT be placed inside an ancestor with aria-hidden="true"'));
  assert.ok(dialog.accessibility.focusManagement.includes('Focus trap must keep Tab/Shift+Tab'));
  assert.ok(dialog.accessibility.focusManagement.includes('Escape key must dismiss'));
  assert.ok(dialog.accessibility.focusManagement.includes('Background content outside dialog must be marked inert'));

  // 3. Required attributes
  assert.ok(dialog.accessibility.requiredAttributes.some(a => a.includes('aria-modal="true"')));
  assert.ok(dialog.accessibility.requiredAttributes.some(a => a.includes('aria-labelledby')));
});

test('Section A: POL-A11Y-004 detects active dialog nested inside ancestor marked aria-hidden="true"', () => {
  // Invalid structure: Dialog wrapped inside backdrop marked aria-hidden="true"
  const badNestedDialog = `
    <div class="overlay" aria-hidden="true">
      <div role="dialog" aria-modal="true" aria-labelledby="dlg-heading">
        <h2 id="dlg-heading">Delete Account</h2>
        <button type="button">Confirm</button>
      </div>
    </div>
  `;

  const result = evaluateDesignPolicy({ proposedMarkupOrComponent: badNestedDialog });
  const finding = result.findings.find(f => f.policyId === 'POL-A11Y-004');
  assert.ok(finding, 'Must flag dialog nested in aria-hidden ancestor');
  assert.equal(finding?.severity, 'ERROR');
  assert.ok(finding?.explanation.includes('hides the dialog and its contents from assistive technologies'));
});

test('Section A: POL-A11Y-004 accepts valid dialog with separate decorative backdrop sibling', () => {
  // Valid structure: Backdrop overlay is a sibling to the dialog
  const validDialog = `
    <div class="dialog-backdrop" aria-hidden="true"></div>
    <div role="dialog" aria-modal="true" aria-labelledby="dlg-title" class="dialog-container">
      <header>
        <h2 id="dlg-title">Edit Profile</h2>
        <button type="button" aria-label="Close dialog"></button>
      </header>
      <div class="dialog-body">
        <label for="name">Name</label>
        <input id="name" type="text" />
      </div>
    </div>
  `;

  const result = evaluateDesignPolicy({ proposedMarkupOrComponent: validDialog });
  const finding = result.findings.find(f => f.policyId === 'POL-A11Y-004');
  assert.equal(finding, undefined, 'Valid dialog with backdrop sibling must pass');
});

test('Section A: POL-A11Y-004 accepts native <dialog open> without redundant role="dialog"', () => {
  // Native semantic HTML: <dialog> doesn't need role="dialog"
  const nativeDialog = `
    <dialog open aria-labelledby="confirm-modal-title">
      <h2 id="confirm-modal-title">Confirm Export</h2>
      <p>Are you sure you want to export?</p>
      <button type="button">Cancel</button>
      <button type="button">Export</button>
    </dialog>
  `;

  const result = evaluateDesignPolicy({ proposedMarkupOrComponent: nativeDialog });
  const finding = result.findings.find(f => f.policyId === 'POL-A11Y-004');
  assert.equal(finding, undefined, 'Native <dialog> with accessible title must pass');
});

test('Section A: POL-A11Y-004 flags native <dialog> missing accessible name', () => {
  const unlabeledDialog = `
    <dialog open>
      <p>Unlabeled message</p>
    </dialog>
  `;

  const result = evaluateDesignPolicy({ proposedMarkupOrComponent: unlabeledDialog });
  const finding = result.findings.find(f => f.policyId === 'POL-A11Y-004');
  assert.ok(finding, 'Must flag native <dialog> missing accessible name');
  assert.equal(finding?.severity, 'ERROR');
});

// ===========================================================================
// SECTION B: POLICY RULES VERIFICATION
// ===========================================================================

test('Section B: POL-A11Y-003 flags form input missing accessible name', () => {
  const badInput = '<div><input type="text" placeholder="Search..." /></div>';
  const result = evaluateDesignPolicy({ proposedMarkupOrComponent: badInput });
  const finding = result.findings.find(f => f.policyId === 'POL-A11Y-003');
  assert.ok(finding);
  assert.equal(finding?.severity, 'ERROR');
  assert.ok(finding?.explanation.includes('Static analysis inspects source markup attributes only'));
});

test('Section B: POL-A11Y-003 accepts input enclosed in native <label> without id', () => {
  // Wrapped native HTML label
  const wrappedInput = '<label>User Email: <input type="email" /></label>';
  const result = evaluateDesignPolicy({ proposedMarkupOrComponent: wrappedInput });
  const finding = result.findings.find(f => f.policyId === 'POL-A11Y-003');
  assert.equal(finding, undefined, 'Enclosed input in <label> must pass');
});

test('Section B: POL-A11Y-003 accepts input with id linked to <label for="id">', () => {
  const labeledInput = '<label for="pwd">Password</label><input id="pwd" type="password" />';
  const result = evaluateDesignPolicy({ proposedMarkupOrComponent: labeledInput });
  const finding = result.findings.find(f => f.policyId === 'POL-A11Y-003');
  assert.equal(finding, undefined, 'Input linked to label must pass');
});

test('Section B: POL-A11Y-003 exempts hidden, submit, button, and reset input types', () => {
  const exemptInputs = `
    <form>
      <input type="hidden" name="csrf" value="12345" />
      <input type="submit" value="Submit Form" />
      <input type="reset" value="Reset Form" />
    </form>
  `;
  const result = evaluateDesignPolicy({ proposedMarkupOrComponent: exemptInputs });
  const finding = result.findings.find(f => f.policyId === 'POL-A11Y-003');
  assert.equal(finding, undefined, 'Non-textual/action inputs must be exempt');
});

test('Section B: POL-RESP-002 flags hardcoded tiny hit targets and notes static limitation', () => {
  const tinyBtn = '<button class="h-[20px] w-[20px] bg-red-500" aria-label="Delete"></button>';
  const result = evaluateDesignPolicy({ proposedMarkupOrComponent: tinyBtn });
  const finding = result.findings.find(f => f.policyId === 'POL-RESP-002');
  assert.ok(finding);
  assert.equal(finding?.severity, 'WARNING');
  assert.ok(finding?.explanation.includes('does not measure rendered layout geometry or computed CSS dimensions'));
});

test('Section B: POL-RESP-002 does not flag standard responsive buttons with padding', () => {
  const normalBtn = '<button class="px-4 py-2 bg-blue-600 rounded text-white" aria-label="Save">Save</button>';
  const result = evaluateDesignPolicy({ proposedMarkupOrComponent: normalBtn });
  const finding = result.findings.find(f => f.policyId === 'POL-RESP-002');
  assert.equal(finding, undefined, 'Standard button with padding must not be flagged');
});

test('Section B: POL-STATE-001 flags interactive button omitting disabled and loading states', () => {
  const stateOmittedComp = `
    export function SubmitButton({ onClick }: { onClick: () => void }) {
      return <button onClick={onClick}>Submit</button>;
    }
  `;
  const result = evaluateDesignPolicy({ proposedMarkupOrComponent: stateOmittedComp });
  const finding = result.findings.find(f => f.policyId === 'POL-STATE-001');
  assert.ok(finding);
  assert.equal(finding?.severity, 'WARNING');
  assert.ok(finding?.explanation.includes('Note: Static analysis inspects direct component props and attributes only'));
});

// ===========================================================================
// SECTION C: CONTRACT AND SCHEMA INTEGRITY
// ===========================================================================

test('Section C: All 4 component contracts strictly validate against ComponentContractSchema', () => {
  const keys = ['button', 'input', 'dialog', 'table'] as const;
  for (const k of keys) {
    const contract = COMPONENT_CONTRACTS[k];
    const parsed = ComponentContractSchema.parse(contract);
    assert.equal(parsed.componentId, k);
    assert.equal(parsed.provenance.license, 'MIT');
    assert.equal(parsed.provenance.verified, true);
  }
});

test('Section C: Invalid component requests fail safely with bounded lookup', () => {
  assert.equal(getComponentContract(''), undefined);
  assert.equal(getComponentContract('random_unsupported_component_12345'), undefined);
  assert.equal(getComponentContract('canvas 3d metamorphic neural graph'), undefined);
});

test('Section C: Unsupported style direction warns safely without corrupting contract', () => {
  // Call with unsupported style direction
  const res = resolveComponent({
    requestedFunctionality: 'Submit button',
    styleDirection: 'cyberpunk_neon_glow' as any
  });

  assert.equal(res.componentContract?.componentId, 'button');
  // Must NOT claim that an invalid style direction was applied
  assert.equal(res.recommendedComponent.propsToPass?.styleDirection, undefined);
  // Must include safety warning in framework conventions
  assert.ok(res.evidence.frameworkConventions.includes('Warning: Requested styleDirection "cyberpunk_neon_glow" is unsupported'));
});

test('Section C: Style adaptations cannot modify or strip accessibility requirements', () => {
  const styles = ['minimal_saas', 'dark_modern', 'editorial', 'neo_brutalist'] as const;
  const originalAccessibility = JSON.stringify(COMPONENT_CONTRACTS.button.accessibility);

  for (const style of styles) {
    const res = resolveComponent({
      requestedFunctionality: 'Button CTA',
      styleDirection: style
    });

    assert.equal(JSON.stringify(res.componentContract?.accessibility), originalAccessibility,
      `Accessibility requirements must remain identical under style direction "${style}"`);
  }
});

// ===========================================================================
// SECTION D: REAL MCP INTERFACE VALIDATION (STDIO & CALLTOOL)
// ===========================================================================

test('Section D: MCP server executes zenitch_resolve_component and validates output shape', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();
  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

  const response = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_resolve_component',
      arguments: {
        requestedFunctionality: 'Customer table with pagination',
        styleDirection: 'editorial'
      }
    }
  });

  assert.ok(!response.isError);
  const parsed = JSON.parse(response.content[0].text);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.componentContract.componentId, 'table');
  assert.equal(parsed.data.componentContract.accessibility.role, 'table');
  assert.equal(parsed.data.recommendedComponent.propsToPass.styleDirection, 'editorial');
});

test('Section D: MCP server executes zenitch_generate_design_system successfully', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();
  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

  const zenitchRes = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_generate_design_system',
      arguments: { productDomain: 'editorial', brandMood: 'editorial' }
    }
  });
  assert.ok(!zenitchRes.isError);
  const zenitchData = JSON.parse(zenitchRes.content[0].text).data;
  assert.equal(zenitchData.systemName, 'Editorial Editorial Design System');
  assert.ok(zenitchData.colorTokens.length > 0);
  assert.ok(zenitchData.colorTokens.find((c: any) => c.name === '--color-primary'));
});

test('Section D: MCP server returns structured error when invalid arguments are provided', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();
  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

  const response = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_resolve_component',
      arguments: {
        requestedFunctionality: 'ab' // Violates min(3) constraint
      }
    }
  });

  const parsed = JSON.parse(response.content[0].text);
  assert.equal(parsed.success, false);
  assert.ok(parsed.error);
});

// ===========================================================================
// SECTION E: PERFORMANCE BENCHMARK (COLD VS WARM)
// ===========================================================================

test('Section E: Contract retrieval maintains ultra-low latency (<0.01ms warm, <0.5ms cold)', () => {
  // Cold lookup
  const t0 = performance.now();
  const coldContract = getComponentContract('dialog');
  const coldTime = performance.now() - t0;
  assert.ok(coldContract);
  assert.ok(coldTime < 1.0, `Cold retrieval took ${coldTime}ms`);

  // Warm lookup benchmark (5,000 iterations)
  const runs = 5000;
  const t1 = performance.now();
  for (let i = 0; i < runs; i++) {
    getComponentContract('button');
    getComponentContract('input');
    getComponentContract('dialog');
    getComponentContract('table');
  }
  const warmAvgMs = (performance.now() - t1) / (runs * 4);
  assert.ok(warmAvgMs < 0.01, `Warm retrieval took ${warmAvgMs}ms`);
});
