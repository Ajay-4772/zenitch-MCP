import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDesignPolicy } from '../src/policy/policy-evaluator.js';
import { ZenitchServer } from '../src/server.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// ===========================================================================
// 1. CLEAN COMPLIANT UI TESTS
// ===========================================================================

test('Design Policy Engine: Clean accessible markup passes with 100% compliance', () => {
  const cleanMarkup = `
    <header class="bg-white border-b border-slate-200 p-4">
      <div class="flex items-center justify-between max-w-5xl mx-auto">
        <h1 class="text-xl font-semibold text-slate-900">Patient Directory</h1>
        <button aria-label="Refresh Directory" class="p-2 border border-slate-300 rounded focus-visible:ring-2">
          <svg class="w-5 h-5"><path d="M4 4h16"/></svg>
        </button>
      </div>
    </header>
  `;

  const result = evaluateDesignPolicy({
    proposedMarkupOrComponent: cleanMarkup,
    productDomain: 'healthcare'
  });

  assert.equal(result.compliant, true);
  assert.equal(result.score, 100);
  assert.equal(result.summary.errorsCount, 0);
  assert.equal(result.findings.length, 0);
});

// ===========================================================================
// 2. POLICY VIOLATION TESTS
// ===========================================================================

test('Design Policy Engine: Catches missing accessible label on empty icon button (POL-A11Y-001)', () => {
  const badMarkup = `
    <div>
      <button class="icon-btn">
        <svg viewBox="0 0 24 24"><path d="M12 2v20"/></svg>
      </button>
    </div>
  `;

  const result = evaluateDesignPolicy({
    proposedMarkupOrComponent: badMarkup
  });

  assert.equal(result.compliant, false); // Mandatory error
  const a11yViolation = result.findings.find(f => f.policyId === 'POL-A11Y-001');
  assert.ok(a11yViolation, 'POL-A11Y-001 must be flagged');
  assert.equal(a11yViolation?.severity, 'ERROR');
  assert.equal(a11yViolation?.isMandatory, true);
  assert.equal(a11yViolation?.isAutomaticallyVerifiable, true);
  assert.ok(a11yViolation?.evidence.includes('<button class="icon-btn">'));
});

test('Design Policy Engine: Catches nonfunctional interactive links with href="#" (POL-INT-001)', () => {
  const dummyLinkMarkup = `
    <nav>
      <a href="#" class="nav-item">Settings</a>
    </nav>
  `;

  const result = evaluateDesignPolicy({
    proposedMarkupOrComponent: dummyLinkMarkup
  });

  assert.equal(result.compliant, false);
  const intViolation = result.findings.find(f => f.policyId === 'POL-INT-001');
  assert.ok(intViolation, 'POL-INT-001 must be flagged');
  assert.equal(intViolation?.severity, 'ERROR');
  assert.ok(result.cleanCodeRecommendation?.includes('href="/dashboard"'));
});

test('Design Policy Engine: Catches unjustified dark theme when healthcare specifies light theme (POL-CLICHE-003)', () => {
  const darkMarkupInHospital = `
    <div class="bg-slate-950 text-white p-6">
      <h2>Emergency Triage Queue</h2>
    </div>
  `;

  const result = evaluateDesignPolicy({
    proposedMarkupOrComponent: darkMarkupInHospital,
    productContext: {
      productName: 'TriageAlert',
      domain: 'healthcare',
      providedFacts: {
        productName: 'TriageAlert',
        domain: 'healthcare',
        primaryUserGoal: 'Alert triage nurses to critical cardiac anomalies',
        specifiedDensity: 'dense',
        specifiedEnvironment: 'office_daylight'
      },
      inferredAssumptions: ['Daylight clinical setting'],
      targetUserProfiles: [],
      informationHierarchy: { primaryFocalPoint: '', secondarySupportingData: '', backgroundOrUtilityContext: '' },
      accessibilityDirectives: { wcagTarget: 'WCAG_2_2_AAA', minimumContrastRatio: '7:1', minimumTouchTargetPx: 44, focusManagementRequirement: '' },
      constraints: {
        recommendedTheme: 'light',
        colorRationale: 'Clinical light theme',
        forbiddenPatterns: [],
        requiredErgonomics: [],
        maxAllowedMotionLevel: 'none'
      },
      justification: 'Healthcare safety mandate'
    }
  });

  const darkViolation = result.findings.find(f => f.policyId === 'POL-CLICHE-003');
  assert.ok(darkViolation, 'POL-CLICHE-003 must be flagged');
  assert.equal(darkViolation?.severity, 'ERROR');
  assert.ok(darkViolation?.explanation.includes('healthcare'));
});

test('Design Policy Engine: Flags unjustified neon glow on enterprise SaaS (POL-CLICHE-001)', () => {
  const neonMarkup = `
    <div class="card box-shadow: 0 0 20px #00ffff">
      <h3>Monthly Invoices</h3>
    </div>
  `;

  const result = evaluateDesignPolicy({
    proposedMarkupOrComponent: neonMarkup,
    productDomain: 'enterprise_saas'
  });

  const neonViolation = result.findings.find(f => f.policyId === 'POL-CLICHE-001');
  assert.ok(neonViolation, 'POL-CLICHE-001 must be flagged');
  assert.equal(neonViolation?.severity, 'WARNING');
});

test('Design Policy Engine: Recommends reusing existing component when Button is detected (POL-REUSE-001)', () => {
  const rawButtonMarkup = `
    <div class="action-bar">
      <button class="px-4 py-2 bg-blue-600 text-white rounded">Submit</button>
    </div>
  `;

  const result = evaluateDesignPolicy({
    proposedMarkupOrComponent: rawButtonMarkup,
    projectContext: {
      projectRoot: '/mock/repo',
      framework: 'nextjs_app_router',
      styling: 'tailwind_v3',
      packageManager: 'npm',
      detectedLanguages: ['TypeScript', 'CSS'],
      structureSummary: 'Mock Next.js project',
      hasExistingDesignTokens: false,
      detectedDesignTokens: [],
      discoveredComponents: [
        { name: 'Button', filePath: 'src/components/ui/button.tsx', type: 'ui_primitive' }
      ],
      discoveredPagesAndRoutes: [],
      routesCount: 0,
      dependencies: {},
      preservationWarnings: [],
      securitySummary: { secretsRedactedCount: 0, environmentFilesIgnored: [] }
    }
  });

  const reuseViolation = result.findings.find(f => f.policyId === 'POL-REUSE-001');
  assert.ok(reuseViolation, 'POL-REUSE-001 must be flagged');
  assert.equal(reuseViolation?.severity, 'WARNING');
  assert.ok(reuseViolation?.recommendedCorrection.includes('Import { Button }'));
});

test('Design Policy Engine: Catches infinite animation missing prefers-reduced-motion (POL-PERF-002)', () => {
  const infiniteAnimation = `
    <div class="hero-spinner animate-spin">
      <span>Loading...</span>
    </div>
  `;

  const result = evaluateDesignPolicy({
    proposedMarkupOrComponent: infiniteAnimation
  });

  const perfViolation = result.findings.find(f => f.policyId === 'POL-PERF-002');
  assert.ok(perfViolation, 'POL-PERF-002 must be flagged');
  assert.equal(perfViolation?.severity, 'ERROR');
});

// ===========================================================================
// 3. CONFLICTING POLICIES DETECTION
// ===========================================================================

test('Design Policy Engine: Detects and reports policy conflicts between custom rule and product domain', () => {
  const result = evaluateDesignPolicy({
    proposedMarkupOrComponent: '<div class="card">Content</div>',
    productDomain: 'healthcare',
    productContext: {
      productName: 'ClinicPortal',
      domain: 'healthcare',
      providedFacts: {
        productName: 'ClinicPortal',
        domain: 'healthcare',
        primaryUserGoal: 'Review clinical records',
        specifiedDensity: 'high',
        specifiedEnvironment: 'office_daylight'
      },
      inferredAssumptions: [],
      targetUserProfiles: [],
      informationHierarchy: { primaryFocalPoint: '', secondarySupportingData: '', backgroundOrUtilityContext: '' },
      accessibilityDirectives: { wcagTarget: 'WCAG_2_2_AAA', minimumContrastRatio: '7:1', minimumTouchTargetPx: 44, focusManagementRequirement: '' },
      constraints: {
        recommendedTheme: 'light',
        colorRationale: '',
        forbiddenPatterns: [],
        requiredErgonomics: [],
        maxAllowedMotionLevel: 'none'
      },
      justification: ''
    },
    customPolicies: [
      {
        id: 'custom-force-dark',
        name: 'Force Dark Mode Aesthetic',
        category: 'visual_consistency',
        severity: 'WARNING',
        scope: 'custom',
        isMandatory: false,
        description: 'Enforce dark mode across all interfaces',
        explanation: 'Brand marketing guideline',
        remediation: 'Apply dark classes'
      }
    ]
  });

  assert.ok(result.policyConflicts.length > 0, 'Policy conflict must be identified');
  assert.ok(result.policyConflicts[0].conflictReason.includes('conflicts with product domain'));
  assert.ok(result.policyConflicts[0].resolution.includes('Product safety constraints take precedence'));
});

// ===========================================================================
// 4. MISSING CONTEXT & CUSTOM POLICY HANDLING
// ===========================================================================

test('Design Policy Engine: Gracefully handles missing product and project context', () => {
  const result = evaluateDesignPolicy({
    proposedMarkupOrComponent: '<p class="text-sm">Safe static text</p>'
  });

  assert.equal(result.compliant, true);
  assert.equal(result.score, 100);
  assert.ok(result.contextualDistinction.mandatoryRequirements.length > 0);
});

// ===========================================================================
// 5. MCP SERVER END-TO-END TOOL CALL INTEGRATION
// ===========================================================================

test('ZenitchServer: executes zenitch_evaluate_design_policy via CallTool and returns structured findings', async () => {
  const server = new ZenitchServer({ logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();

  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);
  const response = await callHandler({
    method: 'tools/call',
    params: {
      name: 'zenitch_evaluate_design_policy',
      arguments: {
        proposedMarkupOrComponent: '<a href="#" class="btn"><img src="icon.png"></a>',
        productDomain: 'enterprise_saas'
      }
    }
  });

  assert.ok(!response.isError);
  const parsed = JSON.parse(response.content[0].text);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.compliant, false); // href="#" and img without alt are ERRORS
  assert.ok(parsed.data.findings.length >= 2);
  assert.ok(parsed.data.score < 100);
  assert.ok(parsed.data.cleanCodeRecommendation);
});


// ===========================================================================
// 6. POL-CLICHE-002 & POL-RESP-001 REFINEMENT REGRESSION TESTS
// ===========================================================================

test('POL-CLICHE-002: Modal backdrop blur alone does NOT trigger glassmorphism cliché warning', () => {
  const modalBackdropCss = `
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(2px);
      display: none;
      z-index: 40;
    }
    .dialog-card {
      position: fixed;
      top: 50%;
      left: 50%;
      background: #ffffff;
      padding: 24px;
    }
  `;

  const resultCss = evaluateDesignPolicy({
    proposedMarkupOrComponent: modalBackdropCss,
    productDomain: 'enterprise_saas'
  });

  const clicheFindingCss = resultCss.findings.find(f => f.policyId === 'POL-CLICHE-002');
  assert.equal(clicheFindingCss, undefined, 'Modal backdrop blur in CSS should not trigger POL-CLICHE-002');

  const modalBackdropHtml = `
    <div id="modal-backdrop" class="fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true"></div>
    <div role="dialog" aria-modal="true" aria-labelledby="modal-title" class="bg-white p-6 rounded-lg">
      <h2 id="modal-title">Confirm Patient Transfer</h2>
    </div>
  `;

  const resultHtml = evaluateDesignPolicy({
    proposedMarkupOrComponent: modalBackdropHtml,
    productDomain: 'healthcare'
  });

  const clicheFindingHtml = resultHtml.findings.find(f => f.policyId === 'POL-CLICHE-002');
  assert.equal(clicheFindingHtml, undefined, 'Modal backdrop blur in HTML overlay should not trigger POL-CLICHE-002');
});

test('POL-CLICHE-002: Frosted glassmorphism on content cards or data tables triggers warning in utilitarian domains', () => {
  const glassCard = `
    <div class="patient-card bg-white/20 backdrop-blur-md border border-white/30 p-4">
      <h3>Patient Vitals</h3>
      <p>Heart Rate: 72 bpm</p>
    </div>
  `;

  const cardResult = evaluateDesignPolicy({
    proposedMarkupOrComponent: glassCard,
    productDomain: 'healthcare'
  });

  const cardViolation = cardResult.findings.find(f => f.policyId === 'POL-CLICHE-002');
  assert.ok(cardViolation, 'Glassmorphism on clinical card must trigger POL-CLICHE-002');
  assert.equal(cardViolation?.severity, 'WARNING');

  const glassTableCss = `
    .data-table {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(8px);
      color: #333333;
    }
  `;

  const tableResult = evaluateDesignPolicy({
    proposedMarkupOrComponent: glassTableCss,
    productDomain: 'enterprise_saas'
  });

  const tableViolation = tableResult.findings.find(f => f.policyId === 'POL-CLICHE-002');
  assert.ok(tableViolation, 'Glassmorphism on enterprise data table must trigger POL-CLICHE-002');
});

test('POL-RESP-001: Desktop max-width constraints are NOT treated as responsive defects', () => {
  const responsiveLayout = `
    <main style="max-width: 1200px; margin: 0 auto; padding: 3rem 1.5rem;">
      <h1 class="text-3xl font-bold">Fluid Architectural Grid</h1>
      <p class="max-w-[650px] mb-8">Designing modern spaces.</p>
    </main>
  `;

  const result = evaluateDesignPolicy({
    proposedMarkupOrComponent: responsiveLayout,
    productDomain: 'consumer'
  });

  const respFinding = result.findings.find(f => f.policyId === 'POL-RESP-001');
  assert.equal(respFinding, undefined, 'Desktop max-width should not trigger POL-RESP-001');
});

test('POL-RESP-001: Fixed hardcoded viewport widths trigger responsive warning', () => {
  const fixedLayoutCss = `
    .dashboard-container {
      width: 1200px;
      margin: 0 auto;
    }
  `;

  const resultCss = evaluateDesignPolicy({
    proposedMarkupOrComponent: fixedLayoutCss,
    productDomain: 'enterprise_saas'
  });

  const respFindingCss = resultCss.findings.find(f => f.policyId === 'POL-RESP-001');
  assert.ok(respFindingCss, 'Fixed width: 1200px must trigger POL-RESP-001');
  assert.equal(respFindingCss?.severity, 'WARNING');

  const fixedTailwind = `
    <div class="w-[1200px] overflow-hidden">
      <h2>Fixed Desktop Panel</h2>
    </div>
  `;

  const resultTailwind = evaluateDesignPolicy({
    proposedMarkupOrComponent: fixedTailwind,
    productDomain: 'enterprise_saas'
  });

  const respFindingTailwind = resultTailwind.findings.find(f => f.policyId === 'POL-RESP-001');
  assert.ok(respFindingTailwind, 'Fixed w-[1200px] must trigger POL-RESP-001');
});
