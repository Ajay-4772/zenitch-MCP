import { ReducedMotionStatus } from '../schemas/animation.schema.js';

export interface ParsedCssAnimationInfo {
  extractedProperties: string[];
  hasTransitionAll: boolean;
  isInfiniteAnimation: boolean;
  reducedMotion: {
    detectedInCss: boolean;
    isRecognizableEffectiveFallback: boolean;
    status: ReducedMotionStatus;
    details: string;
    suggestedPatch: string | null;
  };
  analysisReport: {
    parsedRulesCount: number;
    unsupportedSyntaxDetected: string[];
    truncatedDueToSizeLimit: boolean;
  };
}

const MAX_CSS_SIZE = 102400; // 100 KB limit

/**
 * Strips comments safely using linear character traversal to prevent ReDoS.
 */
function stripComments(css: string): { cleanCss: string; hasUnclosedComment: boolean } {
  let result = '';
  let i = 0;
  let hasUnclosedComment = false;
  const len = css.length;
  while (i < len) {
    if (css[i] === '/' && i + 1 < len && css[i + 1] === '*') {
      i += 2;
      let closed = false;
      while (i < len) {
        if (css[i] === '*' && i + 1 < len && css[i + 1] === '/') {
          closed = true;
          i += 2;
          break;
        }
        i++;
      }
      if (!closed) {
        hasUnclosedComment = true;
      }
    } else {
      result += css[i];
      i++;
    }
  }
  return { cleanCss: result, hasUnclosedComment };
}

/**
 * Splits comma-separated values while respecting parentheses (e.g. cubic-bezier(0,0,1,1)).
 */
function splitByCommaOutsideParens(str: string): string[] {
  const parts: string[] = [];
  let current = '';
  let parenDepth = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '(') parenDepth++;
    else if (char === ')') {
      if (parenDepth > 0) parenDepth--;
    } else if (char === ',' && parenDepth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function parseCssAnimationSnippet(rawSnippet?: string): ParsedCssAnimationInfo {
  const unsupportedSyntax: string[] = [];
  let truncatedDueToSizeLimit = false;

  if (!rawSnippet || rawSnippet.trim().length === 0) {
    return {
      extractedProperties: [],
      hasTransitionAll: false,
      isInfiniteAnimation: false,
      reducedMotion: {
        detectedInCss: false,
        isRecognizableEffectiveFallback: false,
        status: 'NOT_APPLICABLE',
        details: 'No CSS snippet was provided for static stylesheet inspection.',
        suggestedPatch: null
      },
      analysisReport: {
        parsedRulesCount: 0,
        unsupportedSyntaxDetected: [],
        truncatedDueToSizeLimit: false
      }
    };
  }

  let css = rawSnippet;
  if (css.length > MAX_CSS_SIZE) {
    css = css.slice(0, MAX_CSS_SIZE);
    truncatedDueToSizeLimit = true;
    unsupportedSyntax.push('CSS input exceeded 100 KB limit and was truncated for safe processing.');
  }

  const { cleanCss, hasUnclosedComment } = stripComments(css);
  if (hasUnclosedComment) {
    unsupportedSyntax.push('Malformed CSS: Unclosed comment block (/* ...) encountered.');
  }
  const extractedProperties = new Set<string>();
  let hasTransitionAll = false;
  let isInfiniteAnimation = false;
  let parsedRulesCount = 0;

  // Track keyframes map: name -> Set of properties
  const keyframesMap = new Map<string, Set<string>>();

  // Track reduced motion block content
  let reducedMotionDetected = false;
  let reducedMotionBody = '';

  // Parser state machine for balanced braces
  let i = 0;
  const len = cleanCss.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(cleanCss[i])) i++;
    if (i >= len) break;

    // Read header until '{' or ';'
    let header = '';
    while (i < len && cleanCss[i] !== '{' && cleanCss[i] !== ';') {
      header += cleanCss[i];
      i++;
    }

    if (i >= len) break;

    if (cleanCss[i] === ';') {
      // Standalone statement or import/charset
      const trimmedHeader = header.trim();
      if (trimmedHeader.startsWith('@import') || trimmedHeader.startsWith('@charset')) {
        unsupportedSyntax.push(`Ignored at-rule: ${trimmedHeader}`);
      }
      i++;
      continue;
    }

    if (cleanCss[i] === '{') {
      i++; // Skip opening '{'
      let depth = 1;
      let body = '';

      while (i < len && depth > 0) {
        if (cleanCss[i] === '{') {
          depth++;
        } else if (cleanCss[i] === '}') {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        body += cleanCss[i];
        i++;
      }

      if (depth > 0) {
        unsupportedSyntax.push('Malformed CSS: Unclosed block encountered in stylesheet.');
      }

      const trimmedHeader = header.trim();
      parsedRulesCount++;

      // Check for @media (prefers-reduced-motion)
      if (/@media[^{]*prefers-reduced-motion/i.test(trimmedHeader)) {
        reducedMotionDetected = true;
        reducedMotionBody += ' ' + body;
        continue;
      }

      // Check for @keyframes <name>
      const keyframesMatch = trimmedHeader.match(/@(?:-webkit-)?keyframes\s+([a-zA-Z0-9_-]+)/i);
      if (keyframesMatch) {
        const keyframeName = keyframesMatch[1];
        const kfProps = new Set<string>();

        // Parse declarations inside keyframe blocks
        // e.g., 0% { opacity: 0; } or from { transform: scale(0); }
        const declMatches = body.matchAll(/([a-zA-Z0-9_-]+)\s*:\s*([^;{}]+)/g);
        for (const m of declMatches) {
          const prop = m[1].trim().toLowerCase();
          if (prop !== 'animation-timing-function') {
            kfProps.add(prop);
          }
        }
        keyframesMap.set(keyframeName, kfProps);
        continue;
      }

      // Standard rule or nested declarations
      parseDeclarations(body, extractedProperties, (isInf) => {
        if (isInf) isInfiniteAnimation = true;
      }, (transAll) => {
        if (transAll) hasTransitionAll = true;
      }, keyframesMap);
    }
  }

  // Check reduced motion effectiveness
  let isRecognizableEffectiveFallback = false;
  let rmStatus: ReducedMotionStatus = 'MISSING_FALLBACK';
  let rmDetails = 'No @media (prefers-reduced-motion) query was detected in the provided CSS.';
  let suggestedPatch: string | null = `/* Suggested Reduced-Motion Fallback Patch */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}`;

  if (reducedMotionDetected) {
    // Check if the body contains actual animation/transition remediation
    const hasAnimationNone = /animation\s*:\s*none/i.test(reducedMotionBody);
    const hasTransitionNone = /transition\s*:\s*none/i.test(reducedMotionBody);
    const hasZeroDuration = /(?:animation-duration|transition-duration)\s*:\s*(?:0s|0ms|0\.001ms|0\.01ms)/i.test(reducedMotionBody);
    const hasSingleIteration = /animation-iteration-count\s*:\s*1/i.test(reducedMotionBody);

    if (hasAnimationNone || hasTransitionNone || hasZeroDuration || hasSingleIteration) {
      isRecognizableEffectiveFallback = true;
      rmStatus = 'EFFECTIVE_REMEDIATION';
      rmDetails = 'Recognized effective reduced-motion rules (e.g. animation: none, transition: none, or zero/clamped duration) inside @media (prefers-reduced-motion).';
      suggestedPatch = null;
    } else {
      isRecognizableEffectiveFallback = false;
      rmStatus = 'COSMETIC_OR_PARTIAL';
      rmDetails = '@media (prefers-reduced-motion) block detected, but it does NOT contain recognizable motion-disabling declarations (e.g. only modifies colors, opacities, or layout without disabling animations/transitions).';
      suggestedPatch = `/* Suggested Remediation: Ensure animations and transitions are disabled or clamped */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}`;
    }
  }

  return {
    extractedProperties: Array.from(extractedProperties).sort(),
    hasTransitionAll,
    isInfiniteAnimation,
    reducedMotion: {
      detectedInCss: reducedMotionDetected,
      isRecognizableEffectiveFallback,
      status: rmStatus,
      details: rmDetails,
      suggestedPatch
    },
    analysisReport: {
      parsedRulesCount,
      unsupportedSyntaxDetected: unsupportedSyntax,
      truncatedDueToSizeLimit
    }
  };
}

function parseDeclarations(
  body: string,
  extractedProps: Set<string>,
  setInfinite: (val: boolean) => void,
  setTransitionAll: (val: boolean) => void,
  keyframesMap: Map<string, Set<string>>
) {
  // Match declarations: name: value
  const declRegex = /([a-zA-Z0-9_-]+)\s*:\s*([^;{}]+)/g;
  let match: RegExpExecArray | null;

  while ((match = declRegex.exec(body)) !== null) {
    const propName = match[1].trim().toLowerCase();
    const value = match[2].trim().toLowerCase();

    if (propName === 'transition') {
      const parts = splitByCommaOutsideParens(value);
      for (const part of parts) {
        const tokens = part.trim().split(/\s+/);
        if (tokens.length > 0) {
          const target = tokens[0].toLowerCase();
          if (target === 'all') {
            setTransitionAll(true);
            extractedProps.add('all');
          } else if (target && !/^[0-9]/.test(target) && target !== 'none' && target !== 'ease' && target !== 'linear') {
            extractedProps.add(target);
          }
        }
      }
    } else if (propName === 'transition-property') {
      const parts = splitByCommaOutsideParens(value);
      for (const p of parts) {
        const norm = p.trim().toLowerCase();
        if (norm === 'all') {
          setTransitionAll(true);
          extractedProps.add('all');
        } else if (norm && norm !== 'none') {
          extractedProps.add(norm);
        }
      }
    } else if (propName === 'animation') {
      if (/\binfinite\b/i.test(value)) {
        setInfinite(true);
      }
      const parts = splitByCommaOutsideParens(value);
      for (const part of parts) {
        const tokens = part.trim().split(/\s+/);
        if (tokens.length > 0) {
          const animName = tokens[0];
          if (keyframesMap.has(animName)) {
            const kfProps = keyframesMap.get(animName)!;
            for (const kp of kfProps) extractedProps.add(kp);
          }
        }
      }
    } else if (propName === 'animation-name') {
      const names = splitByCommaOutsideParens(value);
      for (const name of names) {
        const animName = name.trim();
        if (keyframesMap.has(animName)) {
          const kfProps = keyframesMap.get(animName)!;
          for (const kp of kfProps) extractedProps.add(kp);
        }
      }
    } else if (propName === 'animation-iteration-count') {
      if (/\binfinite\b/i.test(value) || parseInt(value, 10) >= 100) {
        setInfinite(true);
      }
    }
  }
}
