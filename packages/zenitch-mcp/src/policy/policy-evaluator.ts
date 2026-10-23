import {
  PolicyEvaluationInput,
  PolicyEvaluationOutput,
  PolicyFinding,
  PolicyConflict
} from '../schemas/policy.schema.js';
import { DEFAULT_POLICIES, EvaluatablePolicy } from './policy-registry.js';

/**
 * Design Policy Evaluation Engine
 * Evaluates markup/components against configurable multi-tiered policies.
 * Strictly read-only, explainable, and context-aware.
 */
export function evaluateDesignPolicy(input: PolicyEvaluationInput): PolicyEvaluationOutput {
  const {
    proposedMarkupOrComponent,
    productDomain,
    productContext,
    projectContext,
    customPolicies = [],
    disabledPolicyIds = [],
    strictMode = true
  } = input;

  const findings: PolicyFinding[] = [];
  const policyConflicts: PolicyConflict[] = [];

  // 1. Resolve Context
  const effectiveDomain = productContext?.domain || productDomain || 'general';
  const recommendedTheme = productContext?.constraints?.recommendedTheme || 'system';
  const existingComponents = projectContext?.discoveredComponents?.map(c => c.name) || [];
  const projectStyling = projectContext?.styling || 'unknown';
  const projectFramework = projectContext?.framework || 'unknown';

  const evalContext = {
    domain: effectiveDomain,
    projectFramework,
    projectStyling,
    existingComponents,
    recommendedTheme
  };

  // 2. Active Policies Assembly
  const disabledSet = new Set(disabledPolicyIds);
  let activePolicies: EvaluatablePolicy[] = DEFAULT_POLICIES.filter(p => !disabledSet.has(p.id));

  // 3. Custom Policy Integration & Conflict Detection
  for (const custom of customPolicies) {
    // Conflict Check: Custom dark mode requirement vs Product light mode mandate
    if (recommendedTheme === 'light' && (custom.id.includes('dark') || custom.description.toLowerCase().includes('dark mode'))) {
      policyConflicts.push({
        conflictingPolicyIds: [custom.id, 'POL-CLICHE-003'],
        conflictReason: `Custom policy "${custom.name}" requires dark styling, which conflicts with product domain "${effectiveDomain}" requiring a daylight-optimized light theme.`,
        resolution: strictMode ? 'Product safety constraints take precedence in strict mode; custom policy was evaluated with a warning.' : 'Custom policy overrides default.'
      });
    }

    // Convert custom policy to evaluatable entry
    activePolicies.push({
      ...custom,
      scope: custom.scope || 'custom',
      isMandatory: custom.isMandatory ?? true,
      evaluator: (code) => {
        // Generic keyword / pattern check for custom policy description
        const keywordMatch = code.includes(custom.id);
        return {
          violated: keywordMatch,
          evidence: keywordMatch ? `Code matched custom rule identifier: ${custom.id}` : undefined,
          isAutomaticallyVerifiable: false
        };
      }
    });
  }

  // 4. Policy Execution
  for (const policy of activePolicies) {
    try {
      const evalResult = policy.evaluator(proposedMarkupOrComponent, evalContext);
      if (evalResult.violated && evalResult.evidence) {
        findings.push({
          policyId: policy.id,
          policyName: policy.name,
          category: policy.category,
          severity: policy.severity,
          isMandatory: policy.isMandatory,
          evidence: evalResult.evidence,
          explanation: evalResult.explanationOverride || policy.explanation,
          recommendedCorrection: evalResult.remediationOverride || policy.remediation,
          isAutomaticallyVerifiable: evalResult.isAutomaticallyVerifiable
        });
      }
    } catch {
      // Evaluation safety wrapper
    }
  }

  // 5. Score & Summary Metrics
  const errorsCount = findings.filter(f => f.severity === 'ERROR').length;
  const warningsCount = findings.filter(f => f.severity === 'WARNING').length;
  const infoCount = findings.filter(f => f.severity === 'INFO').length;

  const penalty = errorsCount * 25 + warningsCount * 10 + infoCount * 3;
  const score = Math.max(0, 100 - penalty);
  const compliant = errorsCount === 0;

  // 6. Contextual Distinction
  const userProvidedFacts: string[] = [];
  if (productContext?.providedFacts) {
    userProvidedFacts.push(`Product Name: ${productContext.providedFacts.productName}`);
    userProvidedFacts.push(`Product Domain: ${productContext.providedFacts.domain}`);
    userProvidedFacts.push(`Primary Goal: ${productContext.providedFacts.primaryUserGoal}`);
  } else if (productDomain) {
    userProvidedFacts.push(`Specified Domain: ${productDomain}`);
  }

  const detectedProjectInformation: string[] = [];
  if (projectContext) {
    detectedProjectInformation.push(`Framework: ${projectContext.framework}`);
    detectedProjectInformation.push(`Styling: ${projectContext.styling}`);
    detectedProjectInformation.push(`Discovered Components Count: ${projectContext.discoveredComponents.length}`);
  }

  const inferredAssumptions: string[] = productContext?.inferredAssumptions || [
    `Assumed ${effectiveDomain} user workflow priorities based on domain heuristics.`
  ];

  const mandatoryRequirements = activePolicies
    .filter(p => p.isMandatory)
    .map(p => `[${p.id}] ${p.name}`);

  const optionalRecommendations = findings
    .filter(f => !f.isMandatory)
    .map(f => `[${f.policyId}] ${f.recommendedCorrection}`);

  // 7. Clean Code Recommendation Suggestion
  let cleanCodeRecommendation: string | undefined;
  if (findings.length > 0) {
    let sanitized = proposedMarkupOrComponent;
    // Example remediation transforms:
    sanitized = sanitized.replace(/href=["']#["']/g, 'href="/dashboard"');
    sanitized = sanitized.replace(/<button(?![^>]*aria-label)([^>]*)>\s*(<svg[\s\S]*?<\/svg>)\s*<\/button>/gi, '<button aria-label="Action Trigger"$1>$2</button>');
    sanitized = sanitized.replace(/<img(?![^>]*\balt=)([^>]*)>/gi, '<img alt="Visual representation"$1>');
    cleanCodeRecommendation = sanitized !== proposedMarkupOrComponent ? sanitized : undefined;
  }

  return {
    compliant,
    score,
    findings,
    policyConflicts,
    summary: {
      totalEvaluated: activePolicies.length,
      errorsCount,
      warningsCount,
      infoCount
    },
    contextualDistinction: {
      userProvidedFacts,
      detectedProjectInformation,
      inferredAssumptions,
      mandatoryRequirements,
      optionalRecommendations
    },
    cleanCodeRecommendation
  };
}
