import fs from 'node:fs';
import path from 'node:path';
import {
  ProductDomainEnum,
  DataDensityEnum,
  TargetEnvironmentEnum
} from '../schemas/product.schema.js';
import {
  ExperiencePlannerInput,
  ExperiencePlannerInputSchema,
  ExperiencePlanOutput,
  ExperiencePlanOutputSchema,
  CandidateView,
  AdaptiveDesignDirection
} from '../schemas/experience.schema.js';
import { analyzeProductContext } from './product-analyzer.js';
import { inspectProject } from './project-inspector.js';

/**
 * Domain Inference Helper
 * Detects appropriate domain from prompt keywords when domainHint is absent.
 */
function inferDomainFromPrompt(prompt: string): string {
  const lower = prompt.toLowerCase();

  if (/\b(?:shop|e-commerce|ecommerce|store|cart|checkout|sku|product|inventory|sold|order|retail|merch)\b/.test(lower)) {
    return 'ecommerce';
  }
  if (/\b(?:health|clinic|patient|medical|doctor|hospital|triage|vitals|pharma|cardio|dosage)\b/.test(lower)) {
    return 'healthcare';
  }
  if (/\b(?:bank|payment|billing|invoice|transaction|crypto|wallet|trading|portfolio|financial|ledger|fund)\b/.test(lower)) {
    return 'fintech';
  }
  if (/\b(?:code|git|repo|terminal|api|developer|debug|log|telemetry|metrics|devops|sdk|cli)\b/.test(lower)) {
    return 'developer_tool';
  }
  if (/\b(?:luxury|bespoke|atelier|jewelry|perfume|couture|prestige|high-end)\b/.test(lower)) {
    return 'luxury';
  }
  if (/\b(?:magazine|journal|article|publishing|essay|dispatch|editorial|publication)\b/.test(lower)) {
    return 'editorial';
  }
  if (/\b(?:organization|workspace|rbac|enterprise|permission|sso|workflow|saas|tenant)\b/.test(lower)) {
    return 'enterprise_saas';
  }
  if (/\b(?:admin|backoffice|staff|operator|queue|internal|moderation)\b/.test(lower)) {
    return 'internal_tool';
  }

  return 'consumer';
}

/**
 * Product Title Inference Helper
 */
function inferTitleFromPrompt(prompt: string, domain: string): string {
  if (/\b(?:product performance dashboard)\b/i.test(prompt)) {
    return 'Product Performance Dashboard';
  }
  if (/\be-commerce management portal\b/i.test(prompt)) {
    return 'E-Commerce Management Portal';
  }
  if (/\b(?:converter|calculator|widget|unit converter)\b/i.test(prompt)) {
    return 'Unit Converter Utility';
  }

  const matchNamed = prompt.match(/(?:called|named|titled)\s+([A-Za-z0-9_-]{3,30})/i);
  if (matchNamed && matchNamed[1].trim()) {
    return matchNamed[1].trim();
  }

  const domainCapitalized = domain.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return `${domainCapitalized} Application`;
}

/**
 * Evidence-Based Complexity Assessment
 * Classifies application complexity based on explicit workflow scope and requirements,
 * avoiding rigid templates or over-inferring multi-page architectures.
 */
function assessComplexity(
  prompt: string,
  complexityHint: string,
  targetFormatHint: string
): 'compact' | 'standard' | 'expanded' {
  if (complexityHint && complexityHint !== 'auto_detect') {
    return complexityHint as 'compact' | 'standard' | 'expanded';
  }

  const lower = prompt.toLowerCase();

  // Explicit single-page / single-view instructions
  if (
    /\b(?:single[- ]file|single html|one[- ]file|single[- ]page|single page|one page|single view|compact|widget|calculator|converter)\b/.test(lower)
  ) {
    return 'compact';
  }

  // Count distinct operational entities/modules requested in prompt
  const hasProducts = /\b(?:products?|catalog|inventory|skus?|merchandise)\b/.test(lower);
  const hasOrders = /\b(?:orders?|fulfillment|shipments?)\b/.test(lower);
  const hasCustomers = /\b(?:customers?|clients?|accounts?)\b/.test(lower);
  const hasAnalytics = /\b(?:analytics|reports?|reporting)\b/.test(lower);
  const hasSettings = /\b(?:settings?|configuration|preferences?)\b/.test(lower);
  const hasBilling = /\b(?:billing|invoices?|subscriptions?)\b/.test(lower);

  const distinctModules = [hasProducts, hasOrders, hasCustomers, hasAnalytics, hasSettings, hasBilling].filter(Boolean).length;
  const isPortalOrPlatform = /\b(?:portal|management system|platform|suite|multi[- ]screen|multi[- ]page)\b/.test(lower);

  // If prompt explicitly asks for a portal/suite with >= 3 distinct modules
  if (isPortalOrPlatform && distinctModules >= 3) {
    return 'expanded';
  }

  // If multiple distinct modules are requested (e.g. products AND orders)
  if (distinctModules >= 2 && isPortalOrPlatform) {
    return 'standard';
  }

  // A focused dashboard (e.g. "product performance dashboard") without distinct multi-view requests
  // defaults to compact (one coherent view)
  return 'compact';
}

/**
 * Product Experience Intelligence Planner (PXI Phase 1 Engine)
 * Pure deterministic planner translating raw user requirements into structured experience plans.
 */
export function planProductExperience(input: ExperiencePlannerInput): ExperiencePlanOutput {
  // Validate input schema strictly
  const validatedInput = ExperiencePlannerInputSchema.parse(input);
  const { rawPrompt, domainHint, taskComplexity, targetFormat, designReference, projectRoot } = validatedInput;

  // 1. Domain & Product Identity
  const domain = (domainHint || inferDomainFromPrompt(rawPrompt)) as any;
  const productName = inferTitleFromPrompt(rawPrompt, domain);
  const derivedComplexity = assessComplexity(rawPrompt, taskComplexity, targetFormat);

  // 2. Base Product Analysis (reused from product-analyzer)
  const productContext = analyzeProductContext({
    productName,
    domain,
    primaryUserGoal: `Plan and structure experience for ${productName}`,
    dataDensity: 'medium',
    environment: 'office_daylight'
  });

  // 3. Format Resolution (respecting single-file, prompt hints, and project conventions)
  let resolvedFormat: 'single_file_html' | 'multi_file_static' | 'framework_app' = 'single_file_html';
  let formatRationale = '';

  const lowerPrompt = rawPrompt.toLowerCase();
  const explicitSingleFile =
    targetFormat === 'single_file_html' ||
    /\b(?:single[- ]file|single html|one[- ]file|standalone html|self[- ]contained)\b/.test(lowerPrompt);

  const mentionsFramework = /\b(?:next\.?js|nextjs|react|vite|vue|svelte|astro|remix)\b/i.test(lowerPrompt);

  let detectedProjectFramework = 'vanilla_html_css';
  let detectedProjectStyling = 'vanilla_css';
  const inspectionNotes: string[] = [];

  if (projectRoot) {
    try {
      const resolvedRoot = path.resolve(projectRoot);
      if (!fs.existsSync(resolvedRoot)) {
        inspectionNotes.push(`Provided projectRoot "${projectRoot}" does not exist; fell back to portable defaults.`);
      } else {
        // Resolve canonical path to guard against symlink traversal / broken links
        const realPath = fs.realpathSync(resolvedRoot);
        const stat = fs.statSync(realPath);
        if (stat.isDirectory()) {
          const inspection = inspectProject({ projectRoot: realPath });
          detectedProjectFramework = inspection.framework;
          detectedProjectStyling = inspection.styling;
          inspectionNotes.push(`Successfully inspected project conventions from "${projectRoot}" (${detectedProjectFramework}).`);
        } else {
          inspectionNotes.push(`Provided projectRoot "${projectRoot}" resolves to a file, not a directory; fell back to portable defaults.`);
        }
      }
    } catch (err: any) {
      inspectionNotes.push(`Project inspection bypassed for "${projectRoot}" (${err.message}); fell back to portable defaults.`);
    }
  }

  if (explicitSingleFile) {
    resolvedFormat = 'single_file_html';
    formatRationale = 'Explicit single-file constraint respected. Multi-view navigation will use in-page region switching with semantic <section role="region"> and hidden attributes.';
  } else if (mentionsFramework || (detectedProjectFramework !== 'vanilla_html_css' && detectedProjectFramework !== 'unknown')) {
    resolvedFormat = 'framework_app';
    const fwName = mentionsFramework ? 'Next.js' : detectedProjectFramework;
    formatRationale = `Respecting detected repository framework convention (${fwName}); recommending modular component architecture rather than standalone HTML.`;
  } else if (targetFormat === 'multi_file_static') {
    resolvedFormat = 'multi_file_static';
    formatRationale = 'Multi-file static architecture requested by targetFormat option.';
  } else {
    resolvedFormat = 'single_file_html';
    formatRationale = 'Defaulting to portable single-file architecture with in-page view switching for low deployment overhead.';
  }

  // 4. Adaptive Design Direction (Honoring Explicit Intent & Design References)
  const userRequestedDark =
    designReference?.surfacePreference === 'dark' ||
    /\b(?:dark mode|dark theme|black background|dark aesthetic|charcoal|cyberpunk)\b/.test(lowerPrompt);

  const userRequestedLight =
    designReference?.surfacePreference === 'light' ||
    /\b(?:light mode|light theme|white background|clean light|bright)\b/.test(lowerPrompt);

  const requestedEditorial =
    domain === 'editorial' ||
    /\b(?:editorial|monograph|journal|parchment|literary)\b/.test(lowerPrompt) ||
    designReference?.keyVisualCharacteristics?.some(k => /editorial/i.test(k));

  let recommendedTheme: 'light' | 'dark' | 'system' = 'light';
  let surfaceTone: 'light_neutral' | 'dark_monochrome' | 'warm_editorial' | 'high_contrast' | 'custom_user_override' = 'light_neutral';
  let userOverrideApplied = false;
  let directionRationale = '';
  let selectedArchetype = 'Clean Slate Administrative';
  let primaryColorRecommendation = '#2563eb';
  let backgroundSurfaceHex = '#f8fafc';
  let cardSurfaceHex = '#ffffff';
  let borderHierarchy = '1px solid #e2e8f0';

  if (requestedEditorial && userRequestedDark) {
    recommendedTheme = 'dark';
    surfaceTone = 'warm_editorial';
    userOverrideApplied = true;
    selectedArchetype = 'Dark Editorial Monograph';
    primaryColorRecommendation = '#f59e0b';
    backgroundSurfaceHex = '#1c1917';
    cardSurfaceHex = '#292524';
    borderHierarchy = '1px solid #44403c';
    directionRationale = 'Explicit dark editorial design intent preserved with warm stone surfaces and refined literary hierarchy.';
  } else if (userRequestedDark) {
    recommendedTheme = 'dark';
    surfaceTone = 'dark_monochrome';
    userOverrideApplied = true;
    selectedArchetype = 'Modern Charcoal / Terminal';
    primaryColorRecommendation = '#38bdf8';
    backgroundSurfaceHex = '#0f172a';
    cardSurfaceHex = '#1e293b';
    borderHierarchy = '1px solid #334155';
    directionRationale = 'Explicit user preference for dark surface aesthetic applied, overriding standard domain default.';
  } else if (userRequestedLight) {
    recommendedTheme = 'light';
    surfaceTone = 'light_neutral';
    userOverrideApplied = true;
    selectedArchetype = 'Clean Slate Administrative';
    primaryColorRecommendation = '#2563eb';
    backgroundSurfaceHex = '#f8fafc';
    cardSurfaceHex = '#ffffff';
    borderHierarchy = '1px solid #e2e8f0';
    directionRationale = 'Explicit user preference for light surface aesthetic applied.';
  } else {
    // Contextual baseline derived from domain ergonomics
    if (domain === 'developer_tool' || domain === 'luxury') {
      recommendedTheme = 'dark';
      surfaceTone = 'dark_monochrome';
      selectedArchetype = 'Modern Charcoal / Terminal';
      primaryColorRecommendation = '#38bdf8';
      backgroundSurfaceHex = '#0f172a';
      cardSurfaceHex = '#1e293b';
      borderHierarchy = '1px solid #334155';
      directionRationale = `Domain ergonomics for ${domain} recommend high-contrast dark surfaces for visual clarity.`;
    } else if (domain === 'editorial') {
      recommendedTheme = 'light';
      surfaceTone = 'warm_editorial';
      selectedArchetype = 'Parchment Editorial';
      primaryColorRecommendation = '#b45309';
      backgroundSurfaceHex = '#fafaf9';
      cardSurfaceHex = '#ffffff';
      borderHierarchy = '1px solid #e7e5e4';
      directionRationale = 'Editorial domain recommends warm parchment light surfaces for reading ergonomics.';
    } else {
      recommendedTheme = 'light';
      surfaceTone = 'light_neutral';
      selectedArchetype = 'Clean Slate Administrative';
      primaryColorRecommendation = '#2563eb';
      backgroundSurfaceHex = '#f8fafc';
      cardSurfaceHex = '#ffffff';
      borderHierarchy = '1px solid #e2e8f0';
      directionRationale = `Standard daylight administrative baseline for ${domain} prioritizing high scannability and accurate data representation.`;
    }
  }

  const designDirection: AdaptiveDesignDirection = {
    selectedArchetype,
    surfaceTone,
    recommendedTheme,
    primaryColorRecommendation,
    backgroundSurfaceHex,
    cardSurfaceHex,
    borderHierarchy,
    rationale: directionRationale,
    userOverrideApplied,
    alternativeDirections: [
      {
        name: surfaceTone === 'dark_monochrome' || surfaceTone === 'warm_editorial' ? 'High-Contrast Light Slate' : 'Focused Obsidian Dark',
        tone: surfaceTone === 'dark_monochrome' || surfaceTone === 'warm_editorial' ? 'Light neutral with crisp slate borders' : 'Deep dark with high-contrast accents',
        useCase: surfaceTone === 'dark_monochrome' || surfaceTone === 'warm_editorial' ? 'Office daylight data entry' : 'Low-light executive viewing'
      },
      {
        name: 'Minimalist Monochrome',
        tone: 'Pure grayscale with high-contrast tabular typography',
        useCase: 'Dense operational auditing'
      }
    ]
  };

  // 5. Dynamic Candidate Views (Evidence-Based, No Rigid Templates)
  const candidateViews: CandidateView[] = [];

  // Determine sections for primary view based on prompt domain & intent
  const primarySections = [
    'Executive KPI Metric Cards',
    'Performance Trend Visualizer',
    'Interactive Summary Data Table',
    'Date & Category Filter Controls'
  ];

  if (domain === 'healthcare') {
    primarySections[0] = 'Patient Vitals & Triage Cards';
    primarySections[1] = 'Telemetry Trend Visualizer';
    primarySections[2] = 'Clinical Patient Records Table';
  } else if (domain === 'developer_tool') {
    primarySections[0] = 'Service Health & Latency Cards';
    primarySections[1] = 'Throughput & Error Visualizer';
    primarySections[2] = 'Active Event Log Table';
  }

  // Primary Initial View is ALWAYS established
  candidateViews.push({
    id: 'dashboard',
    title: `${productName} Overview`,
    routeOrHash: '#/dashboard',
    purpose: 'Unified primary view for operational metrics, performance trends, and summary data',
    isInitialView: true,
    confidence: 1.0,
    inclusionRationale: 'Primary operational view fulfilling core user intent.',
    requiredSections: primarySections,
    essentialComponents: ['kpi_card', 'trend_chart', 'data_table', 'filter_bar'],
    dataEntities: ['AggregatedMetrics', 'PrimaryEntityRecord']
  });

  // Secondary Candidate Views are ONLY added if justified by explicit workflow requirements in prompt
  const hasExplicitProducts = /\b(?:products?|catalog|inventory|skus?)\b/.test(lowerPrompt);
  const hasExplicitOrders = /\b(?:orders?|fulfillment|shipments?)\b/.test(lowerPrompt);
  const hasExplicitCustomers = /\b(?:customers?|clients?|accounts?)\b/.test(lowerPrompt);
  const hasExplicitAnalytics = /\b(?:analytics|reports?|reporting)\b/.test(lowerPrompt);

  if (derivedComplexity !== 'compact') {
    if (hasExplicitProducts) {
      candidateViews.push({
        id: 'products',
        title: 'Product Catalog & Inventory',
        routeOrHash: '#/products',
        purpose: 'Inventory management, SKU status tracking, and stock adjustments',
        isInitialView: false,
        confidence: 0.94,
        inclusionRationale: 'Explicit requirement for product catalog and inventory management.',
        requiredSections: ['Product Search & Category Filter', 'Inventory Table with Stock Badges', 'Bulk Action Bar'],
        essentialComponents: ['data_toolbar', 'data_table', 'status_badge', 'pagination'],
        dataEntities: ['ProductSKU', 'InventoryCount']
      });
    }

    if (hasExplicitOrders) {
      candidateViews.push({
        id: 'orders',
        title: 'Order Management',
        routeOrHash: '#/orders',
        purpose: 'Track, filter, and process customer orders and fulfillment states',
        isInitialView: false,
        confidence: 0.92,
        inclusionRationale: 'Explicit requirement for order processing workflow in prompt.',
        requiredSections: ['Order Status Pipeline Toolbar', 'Orders Data Table', 'Fulfillment Actions'],
        essentialComponents: ['data_toolbar', 'data_table', 'status_badge', 'action_button'],
        dataEntities: ['OrderRecord', 'FulfillmentState']
      });
    }

    if (hasExplicitCustomers) {
      candidateViews.push({
        id: 'customers',
        title: 'Customer Directory',
        routeOrHash: '#/customers',
        purpose: 'Inspect customer profiles, purchasing history, and account status',
        isInitialView: false,
        confidence: 0.90,
        inclusionRationale: 'Explicit requirement for customer directory workflow in prompt.',
        requiredSections: ['Customer Directory Search', 'Customer Profile Table', 'Activity History'],
        essentialComponents: ['data_toolbar', 'data_table', 'avatar_badge'],
        dataEntities: ['CustomerProfile', 'PurchaseHistory']
      });
    }

    if (hasExplicitAnalytics && candidateViews.length < 4) {
      candidateViews.push({
        id: 'analytics',
        title: 'Analytics & Reporting',
        routeOrHash: '#/analytics',
        purpose: 'Advanced analytical reporting, export capabilities, and multi-dimensional analysis',
        isInitialView: false,
        confidence: 0.88,
        inclusionRationale: 'Explicit requirement for dedicated analytics and reporting in prompt.',
        requiredSections: ['Report Generation Filter Bar', 'Analytical Breakdown Visualizer', 'Export Controls'],
        essentialComponents: ['report_toolbar', 'breakdown_chart', 'export_button'],
        dataEntities: ['ReportDataSet', 'ExportConfiguration']
      });
    }
  }

  // Ensure views do not exceed 4
  const boundedViews = candidateViews.slice(0, 4);

  // 6. Layout Architecture (Adapted to View Count)
  const layoutArchitecture = {
    archetype: boundedViews.length === 1
      ? ('single_view_drilldown' as const)
      : ('app_shell_sidebar' as const),
    sidebarCollapsible: boundedViews.length > 1,
    headerBreadcrumbs: derivedComplexity === 'expanded',
    mobileNavigationPattern: boundedViews.length === 1
      ? ('bottom_bar' as const)
      : ('off_canvas_drawer' as const)
  };

  // 7. User Flows
  const userFlows = [
    {
      flowId: 'FLOW-01-PRIMARY-NAVIGATION',
      description: boundedViews.length === 1
        ? 'User inspects primary KPI metrics, adjusts filters, and navigates data table rows'
        : 'User switches between top-level functional views via accessible sidebar navigation',
      stepSequence: boundedViews.map(v => `Navigate to ${v.title} (${v.routeOrHash})`)
    }
  ];

  if (boundedViews.length > 1) {
    userFlows.push({
      flowId: 'FLOW-02-DRILLDOWN',
      description: 'User selects an item from inventory table to inspect detailed analytics',
      stepSequence: ['Open Catalog View', 'Filter by processing status', 'Select item row', 'Inspect detailed analytics view']
    });
  }

  // 8. Shared State Model
  const sharedStateModel = [
    {
      stateKey: 'activeView',
      type: 'string',
      defaultValue: boundedViews[0].id,
      consumers: ['NavigationSidebar', 'ViewContainerManager']
    },
    {
      stateKey: 'searchQuery',
      type: 'string',
      defaultValue: '',
      consumers: ['DataToolbar', 'CatalogTable']
    }
  ];

  if (boundedViews.length > 2) {
    sharedStateModel.push({
      stateKey: 'selectedProductId',
      type: 'string | null',
      defaultValue: 'null',
      consumers: ['CatalogTable', 'ProductDetailView']
    });
  }

  // 9. Inferred Assumptions vs. Facts
  const inferredAssumptions = [
    `Assessed ${derivedComplexity} application complexity based on prompt workflow scope.`,
    userOverrideApplied
      ? 'Applied explicit user theme preference overriding domain default.'
      : `Derived ${recommendedTheme} theme from ${domain} domain ergonomic baseline.`,
    resolvedFormat === 'single_file_html'
      ? 'Client-side region switching used to preserve single-file portability.'
      : 'Modular architecture recommended for maintainability.',
    ...inspectionNotes
  ];

  // 10. Unsupported Capabilities (Strict Honesty & Transparency)
  const unsupportedCapabilities = [
    'Raw visual screenshot pixel parsing is not supported (Zenitch runs headlessly without multimodal vision models; references must be provided as structured descriptions or tokens).',
    'Runtime browser DOM event loop execution and layout geometry rendering are not performed statically.'
  ];

  // 11. Acceptance Criteria
  const acceptanceCriteria = [
    {
      id: 'AC-EXP-01',
      title: 'Navigation Landmark & Active View Indication',
      definition: 'Application declares a semantic <nav> landmark with aria-label and exposes active view with aria-current="page".',
      verificationType: 'static_html' as const
    },
    {
      id: 'AC-EXP-02',
      title: 'Candidate View Container Integrity',
      definition: `All ${boundedViews.length} candidate views have corresponding semantic containers with unique IDs and accessible labels.`,
      verificationType: 'static_html' as const
    },
    {
      id: 'AC-EXP-03',
      title: 'View Switching Visibility Contract',
      definition: 'Initial view is visible; inactive views are visually hidden using standalone hidden attributes or display:none.',
      verificationType: 'static_html' as const
    }
  ];

  const planPayload = {
    productName,
    domain,
    derivedComplexity,
    targetFormat: resolvedFormat,
    formatRationale,
    designDirection,
    layoutArchitecture,
    candidateViews: boundedViews,
    userFlows,
    sharedStateModel,
    inferredAssumptions,
    unsupportedCapabilities,
    acceptanceCriteria
  };

  return ExperiencePlanOutputSchema.parse(planPayload);
}
