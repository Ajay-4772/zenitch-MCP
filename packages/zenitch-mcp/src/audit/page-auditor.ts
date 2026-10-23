import dns from 'node:dns';
import {
  PageAuditInput,
  PageAuditOutput,
  ViewportConfig
} from '../schemas/audit.schema.js';
import { calculateContrastRatio } from '../intelligence/design-system-generator.js';

interface ExtractedElement {
  tag: string;
  attributes: Record<string, string>;
  rawHtml: string;
  innerText: string;
  startIndex: number;
  endIndex: number;
}

interface LabelBlock {
  forId?: string;
  content: string;
  startIndex: number;
  endIndex: number;
}

function parseAttributes(rawTag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // Match key=value pairs or standalone boolean attributes
  const attrRegex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = attrRegex.exec(rawTag)) !== null) {
    const key = match[1].toLowerCase();
    // Ignore trailing slash from self-closing tags
    if (key === '/') continue;

    let val = match[2] ?? match[3] ?? match[4] ?? '';
    if (val === '/') val = ''; // Trailing self-closing slash
    attrs[key] = val;
  }
  return attrs;
}

function preprocessHtml(html: string): string {
  // Strip HTML comments so comment contents don't create phantom elements
  let cleaned = html.replace(/<!--[\s\S]*?-->/g, '');
  // Replace <script>...</script> content with spaces to preserve line offsets
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, (m) => ' '.repeat(m.length));
  // Replace <style>...</style> content with spaces for element parsing
  cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, (m) => ' '.repeat(m.length));
  return cleaned;
}

function extractElements(html: string): ExtractedElement[] {
  const elements: ExtractedElement[] = [];
  const cleaned = preprocessHtml(html);

  // Match opening or self-closing tags
  const tagRegex = /<([a-zA-Z0-9]+)(\s[^>]*?)?(\/?)>/gi;
  let match;
  while ((match = tagRegex.exec(cleaned)) !== null) {
    const tag = match[1].toLowerCase();
    const rawAttrs = match[2] || '';
    const attributes = parseAttributes(rawAttrs);

    elements.push({
      tag,
      attributes,
      rawHtml: match[0].length > 150 ? match[0].slice(0, 150) + '...' : match[0],
      innerText: '',
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }
  return elements;
}

function extractLabelBlocks(html: string): LabelBlock[] {
  const labels: LabelBlock[] = [];
  const cleaned = html.replace(/<!--[\s\S]*?-->/g, '');
  const labelRegex = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi;
  let match;
  while ((match = labelRegex.exec(cleaned)) !== null) {
    const rawAttrs = match[1] || '';
    const content = match[2] || '';
    const attrs = parseAttributes(rawAttrs);
    labels.push({
      forId: attrs['for'],
      content,
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }
  return labels;
}

import {
  isPrivateOrReservedIp,
  isSafeDestination,
  readResponseWithLimit,
  safeFetchHtml as safeFetchHtmlCore,
  DEFAULT_MAX_RESPONSE_BYTES,
  type UrlSafetyOptions,
  type UrlSafetyResult
} from '../utils/url-safety.js';

export async function safeFetchHtml(initialUrl: string, options?: UrlSafetyOptions): Promise<string> {
  const res = await safeFetchHtmlCore(initialUrl, options);
  return res.content;
}

export {
  isPrivateOrReservedIp,
  isSafeDestination,
  readResponseWithLimit,
  DEFAULT_MAX_RESPONSE_BYTES,
  type UrlSafetyOptions,
  type UrlSafetyResult
};

export async function auditPageQuality(input: PageAuditInput): Promise<PageAuditOutput> {
  const {
    url,
    htmlContent,
    viewports = [
      { name: 'mobile_small', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop_standard', width: 1440, height: 900 }
    ],
    checkAccessibility = true,
    checkHorizontalOverflow = true,
    checkInteractiveHitTargets = true
  } = input;

  let htmlSource = htmlContent || '';
  const testedAt = new Date().toISOString();

  // 1. Fetch live markup if not provided directly with SSRF & resource bounds
  if (!htmlSource && url) {
    htmlSource = await safeFetchHtml(url);
  }

  const elements = extractElements(htmlSource);
  const labelBlocks = extractLabelBlocks(htmlSource);

  // 2. Audit Passes
  const missingFormLabels: string[] = [];
  const brokenNavLinks: string[] = [];
  const overflowingElements: string[] = [];
  const touchTargetViolations: Array<{
    selector: string;
    boundingBox: { width: number; height: number };
    minimumRequired: string;
  }> = [];
  const contrastFailures: Array<{
    selector: string;
    textColor: string;
    backgroundColor: string;
    measuredRatio: number;
    requiredRatio: number;
  }> = [];
  const policyViolations: Array<{
    policyId: string;
    rule: string;
    severity: 'ERROR' | 'WARNING' | 'INFO';
    evidence: string;
    recommendation: string;
  }> = [];

  const testedCriteria: string[] = [];
  const untestedCriteria: string[] = [
    'Touch-target dimensions defined in external stylesheets, CSS classes, or CSS frameworks (e.g. Tailwind, Bootstrap)',
    'Computed text contrast ratios resulting from external CSS classes, CSS variables, CSS cascade/inheritance, or background images/gradients',
    'Dynamic pseudo-class styling (:hover, :focus, :active) and focus-visible indicators',
    'Dynamic layout shifts during continuous scrolling (CLS)',
    'GPU compositing frame drops (requires 60FPS browser profiler)',
    'Sub-pixel text rasterization differences across operating systems',
    'Shadow DOM elements, Web Components, and canvas-rendered text'
  ];

  // A. Accessibility Pass
  if (checkAccessibility) {
    testedCriteria.push(
      'Static form input accessible labels (for/id, wrapping <label>, aria-label, aria-labelledby)',
      'Static image alternative text (alt attribute presence)',
      'Interactive link destinations (placeholder href="#" detection)'
    );

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];

      // Form Labels
      if (['input', 'select', 'textarea'].includes(el.tag)) {
        const type = el.attributes['type'] || 'text';
        // Exclude inputs that do not take user textual input or represent buttons/hidden state
        if (!['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) {
          const inputId = el.attributes['id'];
          const hasAriaLabel = !!el.attributes['aria-label'] && el.attributes['aria-label'].trim().length > 0;

          // Check aria-labelledby: must reference an ID present in the document
          let hasAriaLabelledBy = false;
          const labelledById = el.attributes['aria-labelledby']?.trim();
          if (labelledById) {
            hasAriaLabelledBy = elements.some(e => e.attributes['id'] === labelledById);
          }

          // Check explicit <label for="inputId">
          const hasExplicitForLabel = !!inputId && labelBlocks.some(l => l.forId === inputId);

          // Check wrapping <label>...</label>
          const hasWrappingLabel = labelBlocks.some(l =>
            el.startIndex >= l.startIndex && el.endIndex <= l.endIndex
          );

          // Check title attribute fallback
          const hasTitle = !!el.attributes['title'] && el.attributes['title'].trim().length > 0;

          const isAccessible = hasAriaLabel || hasAriaLabelledBy || hasExplicitForLabel || hasWrappingLabel || hasTitle;

          if (!isAccessible) {
            const selector = `${el.tag}${inputId ? `#${inputId}` : `[type="${type}"]`}`;
            missingFormLabels.push(selector);
            policyViolations.push({
              policyId: 'POL-A11Y-001',
              rule: 'Form inputs must have accessible labels',
              severity: 'ERROR',
              evidence: el.rawHtml,
              recommendation: `Associate with an explicit <label for="${inputId || 'field-id'}">, wrap with <label>, or provide an aria-label attribute.`
            });
          }
        }
      }

      // Image Alternatives
      if (el.tag === 'img') {
        const alt = el.attributes['alt'];
        const role = el.attributes['role'];
        const isDecorative = role === 'presentation' || role === 'none';

        if (alt === undefined && !isDecorative) {
          const selector = `img${el.attributes['src'] ? `[src="${el.attributes['src']}"]` : ''}`;
          policyViolations.push({
            policyId: 'POL-A11Y-002',
            rule: 'Images must have an alt attribute or decorative role',
            severity: 'ERROR',
            evidence: el.rawHtml,
            recommendation: 'Provide descriptive alt text for meaningful images or alt="" for decorative images.'
          });
        }
      }

      // Navigation Link Targets
      if (el.tag === 'a') {
        const href = el.attributes['href'];
        if (href === '#' || href === 'javascript:void(0)' || href === 'javascript:;') {
          const selector = `a${el.attributes['id'] ? `#${el.attributes['id']}` : el.attributes['class'] ? `.${el.attributes['class'].split(' ')[0]}` : ''}`;
          brokenNavLinks.push(selector);
          policyViolations.push({
            policyId: 'POL-INT-001',
            rule: 'Interactive elements must not use empty or mockup hash routes',
            severity: 'ERROR',
            evidence: el.rawHtml,
            recommendation: 'Replace href="#" with a valid application route or convert to <button type="button">.'
          });
        }
      }
    }
  }

  // B. Responsive & Horizontal Overflow Pass (Clearly noted as static estimates)
  if (checkHorizontalOverflow) {
    testedCriteria.push(
      'Static estimate: Responsive viewport meta tag presence',
      'Static estimate: Fixed container pixel width vs mobile breakpoints (based on inline styles)'
    );
    const hasViewportMeta = htmlSource.includes('<meta') && htmlSource.includes('viewport');
    const mobileWidth = viewports.find(v => v.name.includes('mobile'))?.width || 375;

    // Scan for inline style width greater than mobile viewport width
    const fixedWidthRegex = /style=["'][^"']*width:\s*([0-9]+)px/gi;
    let widthMatch;
    while ((widthMatch = fixedWidthRegex.exec(htmlSource)) !== null) {
      const px = parseInt(widthMatch[1], 10);
      if (px > mobileWidth) {
        overflowingElements.push(`[style*="width: ${px}px"]`);
        policyViolations.push({
          policyId: 'POL-RESP-001',
          rule: 'Fixed pixel widths must not exceed standard mobile viewport width',
          severity: 'ERROR',
          evidence: `${widthMatch[0]} (Static estimate: layout is not computed by browser engine; media queries may override)`,
          recommendation: `Replace fixed width ${px}px with responsive max-width: 100% or relative CSS grid/flex units.`
        });
      }
    }

    if (!hasViewportMeta && htmlSource.includes('<head>')) {
      overflowingElements.push('meta[name="viewport"] (Missing)');
      policyViolations.push({
        policyId: 'POL-RESP-002',
        rule: 'HTML documents must declare responsive viewport meta tag',
        severity: 'ERROR',
        evidence: '<head> missing <meta name="viewport" ...>',
        recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1.0"> inside <head>.'
      });
    }
  }

  // C. Touch Target Sizing Pass (Static inline inspection)
  if (checkInteractiveHitTargets) {
    testedCriteria.push('Static inline check: Interactive control explicit sizing >= 44x44px');
    for (const el of elements) {
      if (['button', 'a'].includes(el.tag)) {
        const style = el.attributes['style'] || '';
        const widthMatch = style.match(/width:\s*([0-9]+)px/i);
        const heightMatch = style.match(/height:\s*([0-9]+)px/i);

        if (widthMatch && heightMatch) {
          const w = parseInt(widthMatch[1], 10);
          const h = parseInt(heightMatch[1], 10);
          if (w < 44 || h < 44) {
            const selector = `${el.tag}${el.attributes['id'] ? `#${el.attributes['id']}` : ''}`;
            touchTargetViolations.push({
              selector,
              boundingBox: { width: w, height: h },
              minimumRequired: '44x44px (WCAG 2.5.5 / 2.5.8)'
            });
            policyViolations.push({
              policyId: 'POL-INT-002',
              rule: 'Interactive touch targets should meet minimum 44x44px dimensions',
              severity: 'WARNING',
              evidence: `${el.tag} with inline style="${style}" (Static estimate: external CSS classes not computed)`,
              recommendation: `Increase element hit area or padding to at least 44x44px to prevent mis-taps.`
            });
          }
        }
      }
    }
  }

  // D. Static Contrast Pair Audit (Inline style pair inspection)
  const styleColorRegex = /color:\s*(#[0-9a-fA-F]{3,6})[^;]*;[^"]*background(?:-color)?:\s*(#[0-9a-fA-F]{3,6})/gi;
  let colorMatch;
  while ((colorMatch = styleColorRegex.exec(htmlSource)) !== null) {
    const textColor = colorMatch[1];
    const bgColor = colorMatch[2];
    const ratio = calculateContrastRatio(textColor, bgColor);
    if (ratio < 4.5) {
      contrastFailures.push({
        selector: `[style*="${colorMatch[0].slice(0, 40)}"]`,
        textColor,
        backgroundColor: bgColor,
        measuredRatio: ratio,
        requiredRatio: 4.5
      });
      policyViolations.push({
        policyId: 'POL-CONT-001',
        rule: 'Text contrast on background must achieve at least 4.5:1 (WCAG AA)',
        severity: 'ERROR',
        evidence: `color: ${textColor} on background: ${bgColor} (${ratio}:1) (Static estimate from inline styles)`,
        recommendation: `Adjust text or background color to achieve at least 4.5:1 contrast.`
      });
    }
  }

  // 3. Documented Deterministic Quality Score Formula
  let score = 100;
  const deductions: string[] = [];

  if (missingFormLabels.length > 0) {
    const ded = Math.min(30, missingFormLabels.length * 15);
    score -= ded;
    deductions.push(`-${ded} pts: ${missingFormLabels.length} form input(s) lacking accessible labels.`);
  }

  if (brokenNavLinks.length > 0) {
    const ded = Math.min(30, brokenNavLinks.length * 15);
    score -= ded;
    deductions.push(`-${ded} pts: ${brokenNavLinks.length} nonfunctional or placeholder link(s) (href="#").`);
  }

  if (overflowingElements.length > 0) {
    score -= 20;
    deductions.push(`-20 pts: Horizontal overflow / missing responsive viewport meta detected.`);
  }

  if (contrastFailures.length > 0) {
    const ded = Math.min(30, contrastFailures.length * 15);
    score -= ded;
    deductions.push(`-${ded} pts: ${contrastFailures.length} text color contrast failure(s) below 4.5:1.`);
  }

  if (touchTargetViolations.length > 0) {
    const ded = Math.min(20, touchTargetViolations.length * 10);
    score -= ded;
    deductions.push(`-${ded} pts: ${touchTargetViolations.length} interactive touch target(s) smaller than 44x44px.`);
  }

  const finalScore = Math.max(0, Math.min(100, score));

  // 4. Actionable Engineering Recommendations & CSS Patches
  const criticalFixes: string[] = [];
  const suggestedCssDiffs: Array<{ targetFileOrSelector: string; cssPatch: string; explanation: string }> = [];

  if (overflowingElements.length > 0) {
    criticalFixes.push('Eliminate fixed pixel container widths exceeding mobile screens.');
    suggestedCssDiffs.push({
      targetFileOrSelector: overflowingElements[0] || 'body',
      cssPatch: 'max-width: 100%;\nbox-sizing: border-box;\noverflow-x: hidden;',
      explanation: 'Constrains layout containers within the viewport, preventing horizontal scrolling.'
    });
  }

  if (touchTargetViolations.length > 0) {
    criticalFixes.push('Enforce minimum 44px touch target dimensions for interactive controls.');
    suggestedCssDiffs.push({
      targetFileOrSelector: touchTargetViolations[0]?.selector || 'button, a.btn',
      cssPatch: 'min-width: 44px;\nmin-height: 44px;\ndisplay: inline-flex;\nalign-items: center;\njustify-content: center;',
      explanation: 'Provides sufficient physical tap surface area satisfying WCAG 2.5.8.'
    });
  }

  if (missingFormLabels.length > 0) {
    criticalFixes.push('Bind explicit <label> tags or aria-label attributes to all form controls.');
  }

  if (brokenNavLinks.length > 0) {
    criticalFixes.push('Replace placeholder href="#" links with actual application routes.');
  }

  return {
    empiricalFindings: {
      testedUrl: url,
      testedAt,
      auditMode: 'static_source_analysis',
      disclaimer: 'Findings derived from static HTML/CSS source analysis. Rendered layout shifts, external stylesheets, CSS classes, responsive media queries, and computed runtime styles require an active browser runtime.',
      testedCriteria,
      untestedCriteria,
      horizontalOverflowDetected: overflowingElements.length > 0,
      overflowingElements,
      touchTargetViolations,
      contrastFailures,
      missingFormLabels,
      brokenNavLinks,
      policyViolations
    },
    recommendations: {
      criticalFixes,
      suggestedCssDiffs,
      scoreBreakdown: {
        baseScore: 100,
        deductions: deductions.length > 0 ? deductions : ['No deductions. Clean quality audit.'],
        finalScore
      },
      summaryScore: finalScore
    }
  };
}
