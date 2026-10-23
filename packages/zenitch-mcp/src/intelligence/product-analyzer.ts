import {
  ProductAnalysisInput,
  ProductAnalysisOutput,
  ProductDomainEnum,
  DataDensityEnum,
  TargetEnvironmentEnum
} from '../schemas/product.schema.js';

/**
 * Product Intelligence Subsystem
 * Analyzes product context, functional workflows, and ergonomics
 * before recommending UI architectures.
 */
export function analyzeProductContext(input: ProductAnalysisInput): ProductAnalysisOutput {
  const { productName, domain, primaryUserGoal, targetAudience } = input;
  const dataDensity = input.dataDensity || 'medium';
  const environment = input.environment || 'office_daylight';

  const providedFacts = {
    productName,
    domain,
    primaryUserGoal,
    specifiedDensity: dataDensity,
    specifiedEnvironment: environment,
    targetAudience
  };

  const inferredAssumptions: string[] = [];
  const forbiddenPatterns: string[] = [];
  const requiredErgonomics: string[] = [];

  let recommendedTheme: 'light' | 'dark' | 'system' = 'system';
  let colorRationale = '';
  let maxAllowedMotionLevel: 'none' | 'subtle' | 'expressive' | 'cinematic' = 'subtle';
  let wcagTarget: 'WCAG_2_2_AA' | 'WCAG_2_2_AAA' = 'WCAG_2_2_AA';
  let minimumContrastRatio = '4.5:1';

  // 1. Domain-Specific Ergonomic & Cognitive Rules
  switch (domain) {
    case 'healthcare':
      recommendedTheme = 'light';
      wcagTarget = 'WCAG_2_2_AAA';
      minimumContrastRatio = '7:1 (Normal) / 4.5:1 (Large)';
      maxAllowedMotionLevel = 'none';
      colorRationale = 'Neutral clinical slates (#f8fafc) with high-contrast text (#0f172a). Muted clinical status indicators (amber/emerald/rose) with dual icon+text indicators.';
      forbiddenPatterns.push(
        'Unjustified dark mode that reduces legibility in fluorescent clinic lighting',
        'Neon accent colors that conflict with medical alarm standards',
        'Decorative glassmorphic blur or floating cards that obscure critical patient records',
        'Ambient continuous animations that cause cognitive distraction'
      );
      requiredErgonomics.push(
        'High-density tabular scanning with alternating row tones or crisp borders',
        'Visible persistent keyboard focus rings on every interactive element',
        'Strict error prevention confirmations for any medication or patient record edits',
        'Tabular numbers (font-variant-numeric: tabular-nums) for laboratory values'
      );
      inferredAssumptions.push(
        'Users operate in well-lit hospital or clinic environments with potential glare.',
        'Users face high cognitive load and urgency; decorative UI elements increase error rates.',
        'Patient records require rapid scanning rather than visual entertainment.'
      );
      break;

    case 'enterprise_saas':
      recommendedTheme = environment === 'low_light' ? 'dark' : 'light';
      maxAllowedMotionLevel = 'subtle';
      colorRationale = 'Sober slate-gray surfaces with a single purposeful brand accent (e.g. deep indigo or cobalt). No multi-color gradient fills on operational cards.';
      forbiddenPatterns.push(
        'Unjustified neon gradients and heavy drop shadows on data tables',
        'Decorative bento cards that artificially fragment continuous user workflows',
        'Unrequested floating AI chat bubbles that obstruct primary data views',
        'Fake vanity metrics (e.g. arbitrary percentages without business context)'
      );
      requiredErgonomics.push(
        'Multi-column structured layout with clear visual hierarchy',
        'Bulk selection, sorting, and inline keyboard shortcuts for operational efficiency',
        'Standardized 44x44px interactive hit targets for desktop and tablet users'
      );
      inferredAssumptions.push(
        'Primary users are knowledge workers completing repetitive business processes.',
        'Speed of navigation and data legibility directly impact daily productivity.'
      );
      break;

    case 'fintech':
      recommendedTheme = environment === 'low_light' ? 'dark' : 'light';
      wcagTarget = 'WCAG_2_2_AAA';
      minimumContrastRatio = '7:1';
      maxAllowedMotionLevel = 'subtle';
      colorRationale = 'Neutral monetary palette. Green and red must never be the sole differentiator for financial gains/losses; always pair with directional icons (+/-).';
      forbiddenPatterns.push(
        'Pure color-only status indicators without text or icon support',
        'Uncertain or delayed balance update animations',
        'Obscured transaction fees or technical stack badges'
      );
      requiredErgonomics.push(
        'Tabular numerals across all currency and percentage displays',
        'Explicit two-step confirmation for money transfers and authorizations',
        'Zero layout shifts during asynchronous real-time market data streaming'
      );
      inferredAssumptions.push(
        'Users require high trust, transparency, and instant numeric verification.',
        'Mistakes carry direct financial consequences.'
      );
      break;

    case 'developer_tool':
      recommendedTheme = environment === 'office_daylight' ? 'system' : 'dark';
      maxAllowedMotionLevel = 'subtle';
      colorRationale = 'Syntax-focused high-contrast palette. Deep charcoal or clean zinc surfaces with syntax-highlighted accents.';
      forbiddenPatterns.push(
        'Low-contrast dark-gray text on black backgrounds',
        'Slow slide-in or fade transitions that delay code inspection',
        'Unnecessary decorative illustrations taking screen space away from terminals or editors'
      );
      requiredErgonomics.push(
        'Monospace code clarity with explicit line numbers and copy affordances',
        'Full keyboard navigation and command palette (Cmd+K / Ctrl+K) support',
        'Compact density maximizing viewport real estate for terminal/logs'
      );
      inferredAssumptions.push(
        'Users are technical practitioners who prioritize speed, keyboard shortcuts, and text clarity.',
        'Users frequently run tools in split-screen or multi-monitor configurations.'
      );
      break;

    case 'luxury':
      recommendedTheme = 'dark';
      maxAllowedMotionLevel = 'cinematic';
      colorRationale = 'Deep obsidian, warm cassis, or champagne palettes. Restrained metallic accents, avoiding saturated neon.';
      forbiddenPatterns.push(
        'Cliché brass-yellow gold or cartoonish drop shadows',
        'Dense cluttered dashboards resembling enterprise administrative tools',
        'Generic cookie-cutter templates'
      );
      requiredErgonomics.push(
        'Expansive negative space allowing photography and craftsmanship to breathe',
        'Editorial typography pairing (Didone serif + clean modern sans)',
        'Fluid smooth scroll storytelling and hardware-clamped WebGL shaders'
      );
      inferredAssumptions.push(
        'Audience values brand aura, exclusivity, sensory immersion, and aesthetic prestige.',
        'Experience is consumer-facing and emotionally evocative rather than utility-driven.'
      );
      break;

    case 'ecommerce':
      recommendedTheme = 'light';
      maxAllowedMotionLevel = 'subtle';
      colorRationale = 'Neutral background (#ffffff or #fafafa) ensuring product photography colors are 100% accurate. High-contrast primary CTA.';
      forbiddenPatterns.push(
        'Dark or heavily tinted backgrounds that distort product apparel/color accuracy',
        'Hidden pricing or ambiguous add-to-cart buttons',
        'Laggy 3D previews that delay mobile checkout'
      );
      requiredErgonomics.push(
        'Prominent, unambiguous Add to Cart and Checkout touch targets (>48px on mobile)',
        'Instant facet filtering with sticky summary bar',
        'Transparent shipping, tax, and inventory availability indicators'
      );
      inferredAssumptions.push(
        'Conversion and friction-free checkout are the primary commercial metrics.',
        'Significant traffic originates from mobile devices in varied lighting.'
      );
      break;

    case 'internal_tool':
    default:
      recommendedTheme = 'light';
      maxAllowedMotionLevel = 'none';
      colorRationale = 'High-utility clean zinc or cool gray with clear semantic blue primary action.';
      forbiddenPatterns.push(
        'Decorative cards or marketing hero sections on operational internal pages',
        'Animated modal popups that slow down rapid data entry',
        'Unnecessary complex chart widgets when simple tables are required'
      );
      requiredErgonomics.push(
        'Dense tabular layouts with customizable column visibility',
        'Keyboard shortcuts for save, cancel, and row navigation',
        'Immediate inline validation on form inputs'
      );
      inferredAssumptions.push(
        'Users are internal employees who use the tool all day to execute operational workflows.',
        'Performance, reliability, and data density outweigh decorative visual styling.'
      );
      break;
  }

  // 2. Data Density Adjustments
  if (dataDensity === 'dense' || dataDensity === 'high') {
    requiredErgonomics.push('Compact spacing scale (4px/8px increments) with tightly budgeted vertical padding');
    inferredAssumptions.push('User workflow requires viewing maximum data rows simultaneously without excessive vertical scrolling.');
  } else if (dataDensity === 'low') {
    requiredErgonomics.push('Generous whitespace (16px/24px/32px increments) to reduce cognitive overload');
  }

  // 3. User Profiles & Information Hierarchy
  const targetUserProfiles = [
    {
      role: targetAudience || `Primary ${domain.replace('_', ' ')} Operator`,
      primaryWorkflow: primaryUserGoal,
      cognitiveLoadTolerance: (domain === 'healthcare' || domain === 'fintech') ? 'low' as const : 'medium' as const
    }
  ];

  const informationHierarchy = {
    primaryFocalPoint: `Immediate visual affordance for: ${primaryUserGoal}`,
    secondarySupportingData: `Contextual status indicators, audit logs, and domain-relevant metrics without decorative clutter`,
    backgroundOrUtilityContext: `Navigation anchors, profile settings, and system telemetry kept unobtrusive at viewport periphery`
  };

  const accessibilityDirectives = {
    wcagTarget,
    minimumContrastRatio,
    minimumTouchTargetPx: environment === 'field_mobile' ? 48 : 44,
    focusManagementRequirement: 'Non-destructive focus trapping in modals, visible 2px outline on tab navigation, and aria-live announcements on state change.'
  };

  const justification = `Product "${productName}" operates in the ${domain} domain with a ${dataDensity} data density in a ${environment} environment. Analysis establishes that UI must prioritize "${primaryUserGoal}" while rejecting ${forbiddenPatterns.length} anti-patterns (such as unjustified dark/neon themes and decorative bloat). Contrast is budgeted at ${minimumContrastRatio} conforming to ${wcagTarget}.`;

  return {
    productName,
    domain,
    providedFacts,
    inferredAssumptions,
    targetUserProfiles,
    informationHierarchy,
    accessibilityDirectives,
    constraints: {
      recommendedTheme,
      colorRationale,
      forbiddenPatterns,
      requiredErgonomics,
      maxAllowedMotionLevel
    },
    justification
  };
}
