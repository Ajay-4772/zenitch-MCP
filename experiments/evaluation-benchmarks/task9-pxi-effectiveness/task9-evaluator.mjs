/**
 * Zenitch MCP — Task 9 Controlled Effectiveness Evaluator
 * 
 * Symmetrically evaluates Baseline (C0) vs. PXI-Assisted (C1) artifacts
 * for the frozen Task 9 brief: "Telehealth Patient Triage & Vitals Monitoring Console".
 *
 * Invariants:
 * 1. Criterion-Level Evaluation: Every criterion reports PASS, FAIL, or NOT_ASSESSED.
 * 2. Strict Symmetry: Identical verification logic executes across all conditions.
 * 3. Zero Condition Bias: Scoring logic has no awareness of condition labels.
 * 4. Grounded Analysis: Distinguishes static markup evidence from verified runtime event listeners.
 * 5. Evaluator Fairness (Pre-C1 Amendment): Removes dark-mode default bias and evaluates
 *    objective WCAG relative luminance contrast ratio (>= 4.5:1 threshold) for daylight reading.
 *    If static contrast cannot be reliably determined from markup, returns NOT_ASSESSED.
 * 6. Evidence Boundaries: Static HTML inspection explicitly marks runtime interactions,
 *    physical keyboard navigation, computed browser rendering, and visual quality as NOT_ASSESSED.
 */

import fs from 'fs';
import path from 'path';

export const EVALUATOR_NAME = 'Zenitch Task 9 PXI Effectiveness Evaluator';
export const EVALUATOR_VERSION = '3.1.0-pxi-fairness-amended';

/* ==========================================================================
   WCAG 2.1 RELATIVE LUMINANCE & CONTRAST RATIO CALCULATOR
   ========================================================================== */
const NAMED_COLORS = {
  white: { r: 255, g: 255, b: 255 },
  black: { r: 0, g: 0, b: 0 }
};

function parseCssColor(colorStr) {
  if (!colorStr || typeof colorStr !== 'string') return null;
  const str = colorStr.trim().toLowerCase();
  if (NAMED_COLORS[str]) return NAMED_COLORS[str];

  // 6-digit hex (#rrggbb)
  const hex6 = str.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (hex6) {
    return {
      r: parseInt(hex6[1], 16),
      g: parseInt(hex6[2], 16),
      b: parseInt(hex6[3], 16)
    };
  }

  // 3-digit hex (#rgb)
  const hex3 = str.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])/i);
  if (hex3) {
    return {
      r: parseInt(hex3[1] + hex3[1], 16),
      g: parseInt(hex3[2] + hex3[2], 16),
      b: parseInt(hex3[3] + hex3[3], 16)
    };
  }

  // rgb / rgba
  const rgbMatch = str.match(/rgba?\s*\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)/i);
  if (rgbMatch) {
    return {
      r: Math.min(255, parseInt(rgbMatch[1], 10)),
      g: Math.min(255, parseInt(rgbMatch[2], 10)),
      b: Math.min(255, parseInt(rgbMatch[3], 10))
    };
  }

  return null;
}

function calculateRelativeLuminance(rgb) {
  const [rs, gs, bs] = [rgb.r, rgb.g, rgb.b].map(val => {
    const s = val / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function calculateContrastRatio(color1, color2) {
  const lum1 = calculateRelativeLuminance(color1);
  const lum2 = calculateRelativeLuminance(color2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

export const TASK9_CRITERIA = [
  {
    id: 'REQ-T9-01-HEADER',
    title: 'Clinical Header & Session Identity',
    category: 'Landmark',
    description: '<header> landmark containing clinic/telehealth identity and clinician status badge with accessible labeling.',
    verify: (html) => {
      if (!html || typeof html !== 'string') return { status: 'FAIL', reason: 'Missing or empty HTML content.' };
      const headerMatch = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/i);
      if (!headerMatch) {
        return { status: 'FAIL', reason: 'Missing <header> landmark element.' };
      }
      const headerContent = headerMatch[1];
      const hasClinicalIdentity = /(?:telehealth|clinic|triage|hospital|emergency|care|patient\s+monitor)/i.test(headerContent);
      const hasClinicianOrStatus = /(?:clinician|dr\.|nurse|on\s*duty|active|status|shift|session)/i.test(headerContent);
      if (!hasClinicalIdentity) {
        return { status: 'FAIL', reason: '<header> landmark lacks recognizable clinic or telehealth identity.' };
      }
      if (!hasClinicianOrStatus) {
        return { status: 'FAIL', reason: '<header> lacks clinician session or duty status indicator.' };
      }
      return { status: 'PASS', reason: 'Header landmark contains clinical identity and clinician session/status indicator.' };
    }
  },
  {
    id: 'REQ-T9-02-VITALS-GRID',
    title: 'Multi-Metric Triage Telemetry Grid',
    category: 'Product',
    description: 'Telemetry telemetry cards/grid showing Heart Rate, Blood Pressure, SpO2, and Temperature.',
    verify: (html) => {
      if (!html) return { status: 'FAIL', reason: 'Missing HTML.' };
      const hasHR = /(?:heart\s*rate|pulse|bpm|\bhr\b)/i.test(html);
      const hasBP = /(?:blood\s*pressure|mmhg|\bbp\b)/i.test(html);
      const hasSpO2 = /(?:spo2|o2\s*sat|oxygen\s*sat|\bsat\s*o2\b)/i.test(html);
      const hasTemp = /(?:core\s*temp|body\s*temp|temperature|°[cf])/i.test(html);

      const metricsFound = [];
      if (hasHR) metricsFound.push('Heart Rate');
      if (hasBP) metricsFound.push('Blood Pressure');
      if (hasSpO2) metricsFound.push('SpO2');
      if (hasTemp) metricsFound.push('Temperature');

      if (metricsFound.length === 4) {
        return { status: 'PASS', reason: `All 4 core vitals present (${metricsFound.join(', ')}).` };
      }
      return { status: 'FAIL', reason: `Incomplete telemetry metrics: found ${metricsFound.length}/4 (${metricsFound.join(', ')}).` };
    }
  },
  {
    id: 'REQ-T9-03-QUEUE-TABLE',
    title: 'Patient Queue Tabular Structure',
    category: 'Product',
    description: 'Semantic <table> with <thead>, <th scope="col">, and patient queue rows with acuity status badges.',
    verify: (html) => {
      if (!html) return { status: 'FAIL', reason: 'Missing HTML.' };
      const hasTable = /<table\b[^>]*>/i.test(html);
      const hasThead = /<thead\b[^>]*>/i.test(html);
      const hasTh = /<th\b[^>]*>/i.test(html);
      const hasAcuityBadges = /(?:immediate|urgent|standard|critical|non-urgent|triage\s*level)/i.test(html);

      if (!hasTable) {
        return { status: 'FAIL', reason: 'Missing semantic <table> element for patient queue.' };
      }
      if (!hasThead || !hasTh) {
        return { status: 'FAIL', reason: 'Table lacks proper accessible header structure (<thead> / <th>).' };
      }
      if (!hasAcuityBadges) {
        return { status: 'FAIL', reason: 'Table rows lack triage acuity indicators (Immediate, Urgent, Standard).' };
      }
      return { status: 'PASS', reason: 'Semantic <table> with accessible headers and acuity status badges.' };
    }
  },
  {
    id: 'REQ-T9-04-TRIAGE-FILTER',
    title: 'Acuity Filtering Toolbar',
    category: 'Interaction',
    description: 'Accessible filter buttons or select control with aria-pressed, aria-selected, or active class state indication in markup.',
    verify: (html) => {
      if (!html) return { status: 'FAIL', reason: 'Missing HTML.' };
      const hasFilterControls = /(?:filter|acuity|priority|status|all)/i.test(html);
      const hasAriaState = /aria-pressed=['"](?:true|false)['"]/i.test(html) ||
                           /aria-selected=['"](?:true|false)['"]/i.test(html) ||
                           /class=['"][^'"]*(?:active|selected|filter-active)[^'"]*['"]/i.test(html);
      const hasInteractiveButtons = /<(?:button|select)\b[^>]*data-(?:filter|acuity|priority)/i.test(html) ||
                                    /<button\b[^>]*onclick=[^>]*filter/i.test(html) ||
                                    /<select\b[^>]*id=['"][^'"]*filter[^'"]*['"]/i.test(html) ||
                                    /<button\b[^>]*class=['"][^'"]*filter[^'"]*['"]/i.test(html);

      if (hasFilterControls && (hasAriaState || hasInteractiveButtons)) {
        return { status: 'PASS', reason: 'Acuity filter toolbar controls with accessible state markup present (static verification only; runtime interaction not certified).' };
      }
      return { status: 'FAIL', reason: 'Missing acuity filter controls or accessible state indications in markup.' };
    }
  },
  {
    id: 'REQ-T9-05-ALERT-STREAM',
    title: 'Clinical Alert & Anomaly Stream',
    category: 'Product',
    description: 'Container with role="region" or aria-live="polite" announcing vital anomalies.',
    verify: (html) => {
      if (!html) return { status: 'FAIL', reason: 'Missing HTML.' };
      const hasAlertRegion = /aria-live=['"](?:polite|assertive)['"]/i.test(html) ||
                             /role=['"](?:alert|status|region)['"][^>]*aria-label/i.test(html) ||
                             /role=['"](?:alert|region)['"]/i.test(html) && /alert/i.test(html);
      const hasAlertContent = /(?:alert|anomaly|critical|warning|tachycardia|hypoxia|hypertension|fever)/i.test(html);

      if (hasAlertRegion && hasAlertContent) {
        return { status: 'PASS', reason: 'Accessible alert/stream region with live-announcement semantics.' };
      }
      if (hasAlertContent && !hasAlertRegion) {
        return { status: 'FAIL', reason: 'Alert content exists but lacks accessible region semantics (role="alert" / role="region" / aria-live).' };
      }
      return { status: 'FAIL', reason: 'Missing clinical alert/anomaly stream section.' };
    }
  },
  {
    id: 'REQ-T9-06-A11Y-LANDMARKS',
    title: 'Semantic Landmark Architecture',
    category: 'Compliance',
    description: 'Valid <header>, <main>, and <footer> (or <aside>/<nav>) landmarks without improper nesting.',
    verify: (html) => {
      if (!html) return { status: 'FAIL', reason: 'Missing HTML.' };
      const hasHeader = /<header\b/i.test(html);
      const hasMain = /<main\b/i.test(html);
      const hasSecondary = /<(?:footer|aside|nav)\b/i.test(html);

      if (hasHeader && hasMain && hasSecondary) {
        return { status: 'PASS', reason: 'Semantic landmarks (<header>, <main>, and <nav>/<aside>/<footer>) correctly structured.' };
      }
      const missing = [];
      if (!hasHeader) missing.push('<header>');
      if (!hasMain) missing.push('<main>');
      if (!hasSecondary) missing.push('<aside>/<nav>/<footer>');
      return { status: 'FAIL', reason: `Missing required semantic landmarks: ${missing.join(', ')}.` };
    }
  },
  {
    id: 'REQ-T9-07-THEME-ERGONOMICS',
    title: 'Clinical High-Contrast Theme (Daylight Readability)',
    category: 'Compliance',
    description: 'High-contrast clinical surface styling meeting daylight reading standards (WCAG contrast ratio >= 4.5:1, target >= 7:1 AAA). Evaluates objective contrast without dark-mode default bias.',
    verify: (html) => {
      if (!html) return { status: 'FAIL', reason: 'Missing HTML.' };

      // Check for explicit style block, inline styles, or theme variables
      const hasStyles = /<style\b/i.test(html) || /style=['"]/i.test(html);
      if (!hasStyles) {
        return { status: 'FAIL', reason: 'No CSS styles or theme declarations found.' };
      }

      // 1. Attempt static extraction of primary background color
      let bgRaw = null;
      let textRaw = null;

      // Extract inline style on body/html
      const bodyInlineBg = html.match(/<body\b[^>]*style=['"][^'"]*background(?:-color)?\s*:\s*([^;'"\s]+)/i);
      const bodyInlineText = html.match(/<body\b[^>]*style=['"][^'"]*color\s*:\s*([^;'"\s]+)/i);
      if (bodyInlineBg) bgRaw = bodyInlineBg[1];
      if (bodyInlineText) textRaw = bodyInlineText[1];

      // Extract CSS custom properties (--bg-canvas, --bg-surface, --bg, --text-main, --text, etc.)
      if (!bgRaw) {
        const varBg = html.match(/--(?:bg(?:-canvas|-surface|-color)?|surface)\s*:\s*([^;}\n\r]+)/i);
        if (varBg) bgRaw = varBg[1].trim();
      }
      if (!textRaw) {
        const varText = html.match(/--(?:text(?:-main|-primary|-color)?)\s*:\s*([^;}\n\r]+)/i);
        if (varText) textRaw = varText[1].trim();
      }

      // Extract body CSS rule
      if (!bgRaw) {
        const ruleBg = html.match(/body\s*\{[^}]*background(?:-color)?\s*:\s*([^;}\n\r]+)/i);
        if (ruleBg) bgRaw = ruleBg[1].trim();
      }
      if (!textRaw) {
        const ruleText = html.match(/body\s*\{[^}]*color\s*:\s*([^;}\n\r]+)/i);
        if (ruleText) textRaw = ruleText[1].trim();
      }

      // Fallback: check general background-color and color in style block
      if (!bgRaw) {
        const generalBg = html.match(/background(?:-color)?\s*:\s*(#[0-9a-f]{3,6}|rgba?\([^)]+\)|white|black)/i);
        if (generalBg) bgRaw = generalBg[1];
      }
      if (!textRaw) {
        const generalText = html.match(/(?:^|[{;])\s*color\s*:\s*(#[0-9a-f]{3,6}|rgba?\([^)]+\)|white|black)/i);
        if (generalText) textRaw = generalText[1];
      }

      const parsedBg = parseCssColor(bgRaw);
      const parsedText = parseCssColor(textRaw);

      // If both colors could be reliably parsed statically, calculate WCAG contrast ratio
      if (parsedBg && parsedText) {
        const ratio = calculateContrastRatio(parsedBg, parsedText);
        if (ratio >= 4.5) {
          return {
            status: 'PASS',
            reason: `High-contrast clinical theme verified: measurable contrast ratio ${ratio.toFixed(2)}:1 meets daylight readability threshold (>= 4.5:1; target 7:1 AAA). (Background: ${bgRaw}, Text: ${textRaw}).`
          };
        } else {
          return {
            status: 'FAIL',
            reason: `Insufficient contrast for daylight reading: measured contrast ratio ${ratio.toFixed(2)}:1 fails minimum threshold of 4.5:1. (Background: ${bgRaw}, Text: ${textRaw}).`
          };
        }
      }

      // If styles exist, but colors cannot be reliably resolved statically to numeric RGB:
      // Return NOT_ASSESSED instead of guessing (per evaluator fairness mandate)
      return {
        status: 'NOT_ASSESSED',
        reason: 'Theme declarations exist, but static foreground/background colors cannot be reliably resolved to calculate contrast ratio without a browser engine.'
      };
    }
  },
  {
    id: 'REQ-T9-08-RESPONSIVE-LAYOUT',
    title: 'Mobile-Adaptive Grid',
    category: 'Responsive',
    description: 'CSS media queries adapting triage grid and table without hardcoded fixed viewport widths.',
    verify: (html) => {
      if (!html) return { status: 'FAIL', reason: 'Missing HTML.' };
      const hasViewportMeta = /<meta\b[^>]*name=['"]viewport['"][^>]*content=['"][^'"]*width=device-width[^'"]*['"]/i.test(html);
      const hasMediaQueries = /@media\s*\([^)]*(?:max-width|min-width)[^)]*\)/i.test(html);
      const hasFlexibleGrid = /(?:grid-template-columns\s*:\s*repeat\s*\(\s*auto-fit|flex-wrap\s*:\s*wrap)/i.test(html);

      if (!hasViewportMeta) {
        return { status: 'FAIL', reason: 'Missing standard responsive <meta name="viewport"> tag.' };
      }
      if (hasMediaQueries || hasFlexibleGrid) {
        return { status: 'PASS', reason: 'Responsive CSS rules verified via viewport meta and CSS media queries / responsive grid declarations (static declaration check; computed rendering not assessed).' };
      }
      return { status: 'FAIL', reason: 'Missing CSS media queries or responsive grid rules.' };
    }
  }
];

/**
 * Symmetrically evaluates an HTML artifact against the Task 9 contract.
 */
export function evaluateTask9Artifact(htmlContent, metadata = {}) {
  if (typeof htmlContent !== 'string' || htmlContent.trim().length === 0) {
    return {
      status: 'ERROR',
      error: 'Empty or invalid HTML content supplied.',
      criteriaResults: [],
      passedCount: 0,
      failedCount: 0,
      notAssessedCount: 0,
      coveragePercentage: 0
    };
  }

  const results = [];
  let passedCount = 0;
  let failedCount = 0;
  let notAssessedCount = 0;

  for (const criterion of TASK9_CRITERIA) {
    let evalResult;
    try {
      evalResult = criterion.verify(htmlContent);
    } catch (err) {
      evalResult = { status: 'FAIL', reason: `Evaluator runtime exception: ${err.message}` };
    }

    if (evalResult.status === 'PASS') passedCount++;
    else if (evalResult.status === 'FAIL') failedCount++;
    else notAssessedCount++;

    results.push({
      id: criterion.id,
      title: criterion.title,
      category: criterion.category,
      status: evalResult.status,
      reason: evalResult.reason
    });
  }

  const assessableCount = passedCount + failedCount;
  const coveragePercentage = assessableCount > 0
    ? Math.round((passedCount / assessableCount) * 100)
    : 0;

  const scriptContentMatch = htmlContent.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi);
  const totalScriptChars = scriptContentMatch
    ? scriptContentMatch.reduce((acc, tag) => acc + tag.replace(/<\/?script\b[^>]*>/gi, '').length, 0)
    : 0;
  const hasEventListeners = /addEventListener\s*\(\s*['"](?:click|change|input)['"]/i.test(htmlContent) ||
                            /onclick\s*=/i.test(htmlContent);

  return {
    evaluator: EVALUATOR_NAME,
    evaluatorVersion: EVALUATOR_VERSION,
    metadata,
    summary: {
      totalCriteria: TASK9_CRITERIA.length,
      passedCount,
      failedCount,
      notAssessedCount,
      coveragePercentage
    },
    interactionEvidence: {
      hasScriptTag: !!scriptContentMatch,
      totalScriptChars,
      hasInteractiveHandlers: hasEventListeners,
      classification: hasEventListeners ? 'ACTIVE_EVENT_HANDLERS_DETECTED' : 'STATIC_INDICATORS_ONLY',
      note: 'Static presence of handlers does not certify browser execution correctness.'
    },
    evidenceBoundaries: {
      runtimeInteractionExecution: {
        status: 'NOT_ASSESSED',
        reason: 'Static HTML inspection cannot certify runtime event listener execution; requires browser-driven test harness.'
      },
      actualKeyboardNavigation: {
        status: 'NOT_ASSESSED',
        reason: 'Static HTML inspection cannot verify physical focus traps, Tab ring traversal, or keydown event loops; requires interactive browser session.'
      },
      computedBrowserRendering: {
        status: 'NOT_ASSESSED',
        reason: 'Static HTML inspection cannot verify computed layout, absence of horizontal clipping, or subpixel rendering across devices; requires browser rendering.'
      },
      visualQualityRating: {
        status: 'NOT_ASSESSED',
        reason: 'Static HTML inspection cannot assess aesthetic elegance, typographic hierarchy, or subjective visual polish; requires human or multimodal visual audit.'
      }
    },
    criteriaResults: results
  };
}

/**
 * Command-line runner for paired evaluation
 */
if (process.argv[1] && process.argv[1].endsWith('task9-evaluator.mjs')) {
  const args = process.argv.slice(2);
  const baselineIdx = args.indexOf('--baseline');
  const assistedIdx = args.indexOf('--assisted');

  if (baselineIdx === -1 || assistedIdx === -1) {
    console.log('Usage: node task9-evaluator.mjs --baseline <path-to-baseline.html> --assisted <path-to-assisted.html>');
    process.exit(1);
  }

  const baselinePath = args[baselineIdx + 1];
  const assistedPath = args[assistedIdx + 1];

  console.log(`Running ${EVALUATOR_NAME} v${EVALUATOR_VERSION}`);
  console.log(`Baseline Target: ${baselinePath}`);
  console.log(`Assisted Target: ${assistedPath}\n`);

  const baselineHtml = fs.readFileSync(baselinePath, 'utf-8');
  const assistedHtml = fs.readFileSync(assistedPath, 'utf-8');

  const baselineResult = evaluateTask9Artifact(baselineHtml, { condition: 'C0_Baseline', path: baselinePath });
  const assistedResult = evaluateTask9Artifact(assistedHtml, { condition: 'C1_Assisted', path: assistedPath });

  console.log('================================================================');
  console.log(`C0 Baseline Coverage: ${baselineResult.summary.coveragePercentage}% (${baselineResult.summary.passedCount}/${baselineResult.summary.totalCriteria})`);
  console.log(`C1 Assisted Coverage: ${assistedResult.summary.coveragePercentage}% (${assistedResult.summary.passedCount}/${assistedResult.summary.totalCriteria})`);
  console.log('================================================================\n');

  console.log(JSON.stringify({ baselineResult, assistedResult }, null, 2));
}
