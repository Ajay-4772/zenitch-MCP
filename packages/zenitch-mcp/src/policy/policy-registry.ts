import { PolicyDefinition } from '../schemas/policy.schema.js';

export interface EvaluatablePolicy extends PolicyDefinition {
  evaluator: (
    code: string,
    context: {
      domain?: string;
      projectFramework?: string;
      projectStyling?: string;
      existingComponents?: string[];
      recommendedTheme?: string;
    }
  ) => {
    violated: boolean;
    evidence?: string;
    explanationOverride?: string;
    remediationOverride?: string;
    isAutomaticallyVerifiable: boolean;
  };
}

/**
 * Standard Zenitch Baseline Policy Registry across 9 categories
 */
export const DEFAULT_POLICIES: EvaluatablePolicy[] = [
  // 1. Accessibility (Mandatory)
  {
    id: 'POL-A11Y-001',
    name: 'Accessible Interactive Labeling',
    category: 'accessibility',
    severity: 'ERROR',
    scope: 'global',
    isMandatory: true,
    description: 'Interactive buttons, icon links, and triggers must have accessible text or aria-label.',
    explanation: 'Screen readers and assistive technologies cannot convey the purpose of empty icon buttons or unlabeled links.',
    remediation: 'Provide descriptive text content, an aria-label, or an sr-only span inside the interactive element.',
    evaluator: (code) => {
      // Catch <button></button>, <button><svg></svg></button> without text or aria-label
      const buttonWithoutLabel = /<button(?![^>]*aria-label)[^>]*>\s*(?:<svg[^>]*>[\s\S]*?<\/svg>)?\s*<\/button>/i;
      const match = buttonWithoutLabel.exec(code);
      if (match) {
        return {
          violated: true,
          evidence: match[0].slice(0, 120),
          isAutomaticallyVerifiable: true
        };
      }
      return { violated: false, isAutomaticallyVerifiable: true };
    }
  },
  {
    id: 'POL-A11Y-002',
    name: 'Meaningful Image Alternative Text',
    category: 'accessibility',
    severity: 'ERROR',
    scope: 'global',
    isMandatory: true,
    description: 'Image elements must provide an alt attribute describing the image or alt="" if purely decorative.',
    explanation: 'Missing alt attributes cause screen readers to announce raw file paths, severely degrading accessibility.',
    remediation: 'Add an alt attribute describing the visual content or role="presentation" alt="" if decorative.',
    evaluator: (code) => {
      const imgWithoutAlt = /<img(?![^>]*\balt=)[^>]*>/i;
      const match = imgWithoutAlt.exec(code);
      if (match) {
        return {
          violated: true,
          evidence: match[0].slice(0, 100),
          isAutomaticallyVerifiable: true
        };
      }
      return { violated: false, isAutomaticallyVerifiable: true };
    }
  },

  // 2. Interaction Design & Functional Integrity
  {
    id: 'POL-INT-001',
    name: 'Functional Interactive Elements',
    category: 'interaction_design',
    severity: 'ERROR',
    scope: 'global',
    isMandatory: true,
    description: 'Interactive triggers must not use dummy href="#" or empty click handlers without backing actions.',
    explanation: 'Mockup links and non-functional buttons mislead users and fail automated behavioral testing.',
    remediation: 'Provide a valid route, functional handler, or disabled attribute if the action is not yet available.',
    evaluator: (code) => {
      const dummyLinkRegex = /<a[^>]*href=["'](?:#|javascript:void\(0\);?)["'][^>]*>/i;
      const match = dummyLinkRegex.exec(code);
      if (match) {
        return {
          violated: true,
          evidence: match[0],
          isAutomaticallyVerifiable: true
        };
      }
      return { violated: false, isAutomaticallyVerifiable: true };
    }
  },
  {
    id: 'POL-INT-002',
    name: 'Persistent Visible Focus Affordance',
    category: 'interaction_design',
    severity: 'WARNING',
    scope: 'global',
    isMandatory: false,
    description: 'Styles must not strip keyboard focus outlines without providing a visible focus-visible replacement.',
    explanation: 'Removing focus rings makes keyboard navigation impossible for sighted keyboard users.',
    remediation: 'Pair outline-none with focus-visible:ring-2 or a high-contrast CSS outline.',
    evaluator: (code) => {
      const strippedOutline = /\boutline-none\b(?![^"']*(?:focus-visible:|focus:ring|focus:outline))/i;
      const match = strippedOutline.exec(code);
      if (match) {
        return {
          violated: true,
          evidence: match[0],
          isAutomaticallyVerifiable: true
        };
      }
      return { violated: false, isAutomaticallyVerifiable: true };
    }
  },

  // 3. Visual Consistency & Anti-Cliché Rules
  {
    id: 'POL-CLICHE-001',
    name: 'Anti-Neon Glow & Saturated Shadow Policy',
    category: 'visual_consistency',
    severity: 'WARNING',
    scope: 'global',
    isMandatory: false,
    description: 'Avoid gratuitous saturated neon drop-shadows on operational data surfaces unless justified by product context.',
    explanation: 'AI-generated neon glows reduce visual hierarchy contrast and look unprofessional in serious business tools.',
    remediation: 'Use subtle neutral boundary borders (e.g. border-slate-200 / border-zinc-800) instead of glowing shadows.',
    evaluator: (code, ctx) => {
      if (ctx.domain === 'luxury') return { violated: false, isAutomaticallyVerifiable: true };
      const neonShadowRegex = /(?:shadow-\[(?:[^\]]*rgba?\((?:168,\s*85,\s*247|56,\s*189,\s*248|236,\s*72,\s*153)[^\]]*|[^\]]*#f0f|[^\]]*#0ff)\]|box-shadow:[^;]*(?:#00ffff|#ff00ff|rgba\(\s*255,\s*0,\s*255))/i;
      const match = neonShadowRegex.exec(code);
      if (match) {
        return {
          violated: true,
          evidence: match[0],
          isAutomaticallyVerifiable: true
        };
      }
      return { violated: false, isAutomaticallyVerifiable: true };
    }
  },
  {
    id: 'POL-CLICHE-002',
    name: 'Unjustified Glassmorphism Blur',
    category: 'visual_consistency',
    severity: 'WARNING',
    scope: 'global',
    isMandatory: false,
    description: 'Avoid heavy backdrop blur and frosted glass surfaces on utilitarian data tables or clinical dashboards.',
    explanation: 'Backdrop blur on content surfaces impairs text legibility, causes visual vibration, and adds GPU compositing overhead. Note: Backdrop blur on dedicated modal overlays/dialog backdrops is standard focus dimming and is not classified as a cliché.',
    remediation: 'Use solid opaque or semi-opaque neutral container backgrounds.',
    evaluator: (code, ctx) => {
      if (ctx.domain === 'luxury') return { violated: false, isAutomaticallyVerifiable: true };
      if (ctx.domain !== 'healthcare' && ctx.domain !== 'enterprise_saas' && ctx.domain !== 'internal_tool') {
        return { violated: false, isAutomaticallyVerifiable: true };
      }

      // Backdrop blur alone (such as on modal backdrops / dialog overlays / scrims) is standard UI focus dimming,
      // NOT proof of an unjustified glassmorphism cliché.
      // A glassmorphism cliché occurs when backdrop blur is applied to content surfaces
      // (cards, panels, data tables, headers, navigation bars, widgets) or combined with translucent surface backgrounds.
      const glassBlurRegex = /(?:backdrop-blur(?:-(?:none|sm|md|lg|xl|2xl|3xl))?|backdrop-filter:\s*blur(?:\([^)]*\))?)/gi;
      let match: RegExpExecArray | null;
      while ((match = glassBlurRegex.exec(code)) !== null) {
        const blurSnippet = match[0];
        const matchIdx = match.index;

        // Method 1: Check if inside a CSS rule block
        const beforeMatch = code.slice(0, matchIdx);
        const lastOpenBrace = beforeMatch.lastIndexOf('{');
        const lastCloseBrace = beforeMatch.lastIndexOf('}');
        let isBackdropOverlay = false;
        let isContentSurface = false;
        let isTranslucentBg = false;

        if (lastOpenBrace > lastCloseBrace) {
          // Inside a CSS declaration block
          const selectorPart = beforeMatch.slice(lastCloseBrace === -1 ? 0 : lastCloseBrace + 1, lastOpenBrace).trim();
          isBackdropOverlay = /(?:backdrop|overlay|scrim)/i.test(selectorPart) &&
            !/(?:card|table|panel|dashboard|widget|dropdown|navbar)/i.test(selectorPart);
          isContentSurface = /(?:card|table|panel|dashboard|widget|modal-content|dialog-content|header|nav|surface|container)/i.test(selectorPart);
          
          // Check CSS block body for translucent background
          const afterMatch = code.slice(matchIdx);
          const nextCloseBrace = afterMatch.indexOf('}');
          const blockBody = beforeMatch.slice(lastOpenBrace) + (nextCloseBrace !== -1 ? afterMatch.slice(0, nextCloseBrace) : '');
          isTranslucentBg = /(?:rgba?\([^)]+,\s*0?\.[0-9]+\)|hsla?\([^)]+,\s*0?\.[0-9]+\)|transparent)/i.test(blockBody);
        }

        // Method 2: Check if inside an HTML tag attribute list
        const lastOpenAngle = beforeMatch.lastIndexOf('<');
        const lastCloseAngle = beforeMatch.lastIndexOf('>');
        if (lastOpenAngle > lastCloseAngle) {
          const afterMatch = code.slice(matchIdx);
          const nextCloseAngle = afterMatch.indexOf('>');
          const tagContent = beforeMatch.slice(lastOpenAngle) + (nextCloseAngle !== -1 ? afterMatch.slice(0, nextCloseAngle) : '');
          isBackdropOverlay = /(?:backdrop|overlay|scrim|dialog-backdrop|modal-backdrop)/i.test(tagContent) &&
            !/(?:card|table|panel|dashboard|widget|content)/i.test(tagContent);
          isContentSurface = /(?:card|table|panel|dashboard|widget|modal-content|dialog-content|header|nav|surface|container)/i.test(tagContent);
          isTranslucentBg = /(?:bg-(?:white|slate|zinc|gray|neutral|black)\/(?:[1-9]0|[1-9][0-9]?)|background(?:-color)?:\s*rgba?\([^)]+,\s*0?\.[0-9]+\)|bg-opacity)/i.test(tagContent);
        }

        // Method 3: Fallback surrounding token check if not parsed as standard CSS/HTML block
        if (!isBackdropOverlay && !isContentSurface && !isTranslucentBg) {
          const windowStart = Math.max(0, matchIdx - 100);
          const windowEnd = Math.min(code.length, matchIdx + blurSnippet.length + 100);
          const contextSnippet = code.slice(windowStart, windowEnd);
          isBackdropOverlay = /(?:dialog-backdrop|modal-backdrop|backdrop|scrim|overlay|aria-hidden=["']true["']|\.fixed\.inset-0)/i.test(contextSnippet) &&
            !/(?:card|table|panel|dashboard|widget|dropdown-menu|navbar|nav-item)/i.test(contextSnippet);
          isContentSurface = /(?:card|table|panel|dashboard|widget|modal-content|dialog-content|header|nav|surface|container)/i.test(contextSnippet);
          isTranslucentBg = /(?:bg-(?:white|slate|zinc|gray|neutral|black)\/(?:[1-9]0|[1-9][0-9]?)|background(?:-color)?:\s*rgba?\([^)]+,\s*0?\.[0-9]+\)|bg-opacity)/i.test(contextSnippet);
        }

        if (isBackdropOverlay) {
          continue; // Legitimate modal overlay / scrim
        }

        // Only flag if there is evidence of glassmorphism cliché (content surface or translucent frosted surface)
        if (isContentSurface || isTranslucentBg) {
          return {
            violated: true,
            evidence: blurSnippet,
            explanationOverride: `Product domain "${ctx.domain}" strictly requires crisp readability. Glassmorphism styling on content surfaces causes visual vibration and legibility issues.`,
            isAutomaticallyVerifiable: true
          };
        }
      }

      return { violated: false, isAutomaticallyVerifiable: true };
    }
  },
  {
    id: 'POL-CLICHE-003',
    name: 'Unjustified Dark Theme Enforcement',
    category: 'visual_consistency',
    severity: 'ERROR',
    scope: 'product_specific',
    isMandatory: true,
    description: 'Do not impose dark mode when the product analysis explicitly mandates a light theme (e.g. healthcare).',
    explanation: 'Operating in dark mode in high-glare or daylight clinical environments causes eye strain and reduces chart legibility.',
    remediation: 'Align background surfaces with the product constraint (e.g. light theme #f8fafc / #ffffff).',
    evaluator: (code, ctx) => {
      if (ctx.recommendedTheme === 'light') {
        const darkThemeIndicators = /(?:bg-(?:slate|zinc|gray|black)-(?:900|950)|background-color:\s*(?:#0[0-9a-f]{2,5}|rgb\(\s*[0-1][0-9],\s*[0-1][0-9]))/i;
        const match = darkThemeIndicators.exec(code);
        if (match) {
          return {
            violated: true,
            evidence: match[0],
            explanationOverride: `Product analysis specified light theme for ${ctx.domain || 'this product'}, but dark background class was detected.`,
            isAutomaticallyVerifiable: true
          };
        }
      }
      return { violated: false, isAutomaticallyVerifiable: true };
    }
  },

  // 4. Component Reuse
  {
    id: 'POL-REUSE-001',
    name: 'Existing Component Reuse Policy',
    category: 'component_reuse',
    severity: 'WARNING',
    scope: 'project_specific',
    isMandatory: false,
    description: 'Reuse discovered project UI primitives rather than authoring raw HTML buttons or inputs.',
    explanation: 'Bypassing existing design system components fragments accessibility, styling tokens, and consistency.',
    remediation: 'Import and use the existing primitive from your components directory.',
    evaluator: (code, ctx) => {
      if (ctx.existingComponents && ctx.existingComponents.some(c => c.toLowerCase() === 'button')) {
        const rawButton = /<button\b[^>]*class=/i;
        const match = rawButton.exec(code);
        if (match && !code.includes('<Button')) {
          return {
            violated: true,
            evidence: match[0],
            explanationOverride: 'Project already contains an existing Button component. Raw <button class="..."> should be replaced with <Button>.',
            remediationOverride: 'Import { Button } from "@/components/ui/button" instead of creating raw button elements.',
            isAutomaticallyVerifiable: true
          };
        }
      }
      return { violated: false, isAutomaticallyVerifiable: true };
    }
  },

  // 5. Performance Constraints
  {
    id: 'POL-PERF-001',
    name: 'Composite-Only Animation Transitions',
    category: 'performance_constraints',
    severity: 'WARNING',
    scope: 'global',
    isMandatory: false,
    description: 'Transitions should animate composite properties (transform, opacity) rather than layout properties (width, height, top).',
    explanation: 'Animating layout geometry triggers continuous reflow and repaint passes, causing jank on lower-end hardware.',
    remediation: 'Replace width/height/top transitions with transform: scale() or translate3d().',
    evaluator: (code) => {
      const layoutTransitions = /(?:transition-(?:all|width|height|spacing)|transition:\s*(?:width|height|top|left|margin|padding))/i;
      const match = layoutTransitions.exec(code);
      if (match) {
        return {
          violated: true,
          evidence: match[0],
          isAutomaticallyVerifiable: true
        };
      }
      return { violated: false, isAutomaticallyVerifiable: true };
    }
  },
  {
    id: 'POL-PERF-002',
    name: 'Reduced Motion Fallback Compliance',
    category: 'performance_constraints',
    severity: 'ERROR',
    scope: 'global',
    isMandatory: true,
    description: 'Continuous CSS animations must respect @media (prefers-reduced-motion: reduce).',
    explanation: 'Vestibular motion disorders can cause severe vertigo or nausea if continuous animations cannot be silenced.',
    remediation: 'Wrap infinite keyframes with @media (prefers-reduced-motion: no-preference) or provide motion-reduce:animate-none.',
    evaluator: (code) => {
      const infiniteAnimation = /(?:animate-(?:spin|pulse|bounce|meteor)|animation:\s*[^;]*infinite)/i;
      const match = infiniteAnimation.exec(code);
      if (match && !code.includes('motion-reduce') && !code.includes('prefers-reduced-motion')) {
        return {
          violated: true,
          evidence: match[0],
          isAutomaticallyVerifiable: true
        };
      }
      return { violated: false, isAutomaticallyVerifiable: true };
    }
  },

  // 6. Responsive Behavior
  {
    id: 'POL-RESP-001',
    name: 'Responsive Fluid Viewport Boundaries',
    category: 'responsive_behavior',
    severity: 'WARNING',
    scope: 'global',
    isMandatory: false,
    description: 'Avoid fixed viewport width declarations that cause horizontal overflow on mobile screens.',
    explanation: 'Hardcoded widths break responsive layouts and introduce horizontal scrollbars on smaller viewports. Note: Reasonable desktop max-width constraints (e.g. max-w-6xl or max-width: 1200px) maintain fluid responsiveness when viewport shrinks and are not responsive defects.',
    remediation: 'Use max-width with w-full or clamp() instead of fixed width constraints.',
    evaluator: (code) => {
      // Flag fixed viewport width declarations (width: 1200px or w-[1200px])
      // Crucially exempt:
      // - max-width (e.g. max-width: 1200px, max-w-[1200px]) which is standard fluid container bounding
      // - percentages, viewport units (100%, 100vw, etc.)
      const fixedWidthRegex = /(?:(?<![\w-])width:\s*(?:1[0-9]{3}|[89][0-9]{2})px|(?<![\w-])w-\[(?:1[0-9]{3}|[89][0-9]{2})px\])/i;
      const match = fixedWidthRegex.exec(code);
      if (match) {
        return {
          violated: true,
          evidence: match[0],
          isAutomaticallyVerifiable: true
        };
      }
      return { violated: false, isAutomaticallyVerifiable: true };
    }
  }
,
  // 10. Component Contract: Form Input Accessibility
  {
    id: 'POL-A11Y-003',
    name: 'Form Input Accessible Label & Error Linking',
    category: 'accessibility',
    severity: 'ERROR',
    scope: 'global',
    isMandatory: true,
    description: 'Form inputs must provide an accessible label via for/id, aria-label, or enclosing <label>, and error states should be linked via aria-describedby.',
    explanation: 'Unlabeled inputs prevent screen-reader users from identifying field purpose. Note: Static analysis verifies source attributes and markup hierarchy only, and cannot inspect dynamic context label providers or external form wrappers.',
    remediation: 'Provide a <label htmlFor="{id}"> matching the input id, wrap the input inside a <label>, or add an aria-label. Link validation error messages using aria-describedby.',
    evaluator: (code) => {
      const inputRegex = /<input\b([^>]*)>/gi;
      let match;
      while ((match = inputRegex.exec(code)) !== null) {
        const inputTag = match[0];
        const inputAttrs = match[1];

        // Exempt hidden, submit, button, reset, image input types
        if (/type\s*=\s*['"](?:hidden|submit|button|reset|image)['"]/i.test(inputAttrs)) {
          continue;
        }

        // Check if input has explicit aria-label or aria-labelledby
        if (/\b(?:aria-label|aria-labelledby)\s*=/i.test(inputAttrs)) {
          continue;
        }

        // Check if input has an id and there is a corresponding <label for/htmlFor="id"> in the code
        const idMatch = /\bid\s*=\s*['"]([^'"]+)['"]/i.exec(inputAttrs);
        if (idMatch) {
          const inputId = idMatch[1];
          const hasLabel = code.includes('for="' + inputId + '"') || code.includes("for='" + inputId + "'") || code.includes('htmlFor="' + inputId + '"') || code.includes("htmlFor='" + inputId + "'");
          if (hasLabel) {
            continue;
          }
        }

        // Check if input is enclosed inside a <label>...</label> tag
        const inputIndex = match.index;
        const codeBefore = code.slice(0, inputIndex);
        const lastLabelOpen = codeBefore.lastIndexOf('<label');
        const lastLabelClose = codeBefore.lastIndexOf('</label>');
        if (lastLabelOpen !== -1 && lastLabelOpen > lastLabelClose) {
          continue;
        }

        return {
          violated: true,
          evidence: inputTag.slice(0, 100),
          explanationOverride: 'Form input lacks accessible labeling (missing id/for label pair, enclosing <label>, or aria-label). Note: Static analysis inspects source markup attributes only and cannot verify dynamic context providers.',
          isAutomaticallyVerifiable: true
        };
      }
      return { violated: false, isAutomaticallyVerifiable: true };
    }
  },

  // 11. Component Contract: Modal Dialog Overlay Semantics
  {
    id: 'POL-A11Y-004',
    name: 'Modal Dialog Overlay Accessibility Contract',
    category: 'accessibility',
    severity: 'ERROR',
    scope: 'global',
    isMandatory: true,
    description: 'Modal dialogs must have an accessible name, declare aria-modal="true" for custom containers, and MUST NOT be nested inside ancestors with aria-hidden="true".',
    explanation: 'Dialog overlays without accessible names or trapped inside aria-hidden ancestors fail assistive technology navigation. Note: Static analysis verifies structural declarations only and cannot verify runtime focus trapping, Escape event listeners, or inert state.',
    remediation: 'Ensure the dialog is not inside an aria-hidden container. For custom dialogs, add role="dialog", aria-modal="true", and aria-labelledby or aria-label. For native <dialog>, provide an accessible name.',
    evaluator: (code) => {
      // Defect 1: Active dialog nested inside an ancestor with aria-hidden="true"
      const ariaHiddenOpenRegex = /<(?:div|section|aside|main|body)\b(?![^>]*\/>)[^>]*\baria-hidden\s*=\s*['"]true['"][^>]*>/gi;
      let hiddenMatch;
      while ((hiddenMatch = ariaHiddenOpenRegex.exec(code)) !== null) {
        const openTag = hiddenMatch[0];
        const startIndex = hiddenMatch.index + openTag.length;
        const closingTagIndex = code.indexOf('</div>', startIndex);
        const remainingCode = closingTagIndex !== -1 ? code.slice(startIndex, closingTagIndex) : code.slice(startIndex);

        // Check if an active dialog or role="dialog" is nested INSIDE this container
        if (/<(?:div|section|dialog)\b[^>]*(?:role\s*=\s*['"](?:dialog|alertdialog)['"]|<dialog\b)/i.test(remainingCode)) {
          return {
            violated: true,
            evidence: openTag,
            explanationOverride: 'Active dialog is nested inside an ancestor marked aria-hidden="true", which hides the dialog and its contents from assistive technologies.',
            remediationOverride: 'Keep decorative backdrop overlays as separate siblings to the dialog container; never wrap an active dialog inside aria-hidden="true".',
            isAutomaticallyVerifiable: true
          };
        }
      }

      // Defect 2: Custom dialog container missing role, aria-modal, or accessible name
      const customModalRegex = /<(?:div|section)\b[^>]*class\s*=\s*['"][^'"]*\b(?:modal-overlay|dialog-card|dialog-overlay|dialog-container)\b[^'"]*['"][^>]*>/i;
      const customMatch = customModalRegex.exec(code);
      if (customMatch) {
        const tag = customMatch[0];
        const hasRole = /role\s*=\s*['"](?:dialog|alertdialog)['"]/i.test(tag);
        const hasAriaModal = /aria-modal\s*=\s*['"]true['"]/i.test(tag);
        const hasAccessibleName = /\b(?:aria-labelledby|aria-label)\s*=/i.test(tag);

        if (!hasRole || !hasAriaModal || !hasAccessibleName) {
          return {
            violated: true,
            evidence: tag.slice(0, 120),
            explanationOverride: 'Custom dialog container missing required accessibility attributes (role="dialog" or "alertdialog", aria-modal="true", or accessible name via aria-labelledby/aria-label). Note: Static analysis verifies markup attributes only.',
            isAutomaticallyVerifiable: true
          };
        }
      }

      // Defect 3: Native <dialog> without accessible name
      const nativeDialogRegex = /<dialog\b(?![^>]*(?:aria-labelledby|aria-label|\btitle\s*=))[^>]*>/i;
      const nativeMatch = nativeDialogRegex.exec(code);
      if (nativeMatch) {
        return {
          violated: true,
          evidence: nativeMatch[0].slice(0, 100),
          explanationOverride: 'Native <dialog> element lacks an accessible name (missing aria-labelledby or aria-label). Note: Static analysis verifies source attributes only.',
          isAutomaticallyVerifiable: true
        };
      }

      return { violated: false, isAutomaticallyVerifiable: true };
    }
  },

  // 12. Component Contract: Interactive Touch Target Minimum
  {
    id: 'POL-RESP-002',
    name: 'Interactive Touch Target Minimum Size',
    category: 'responsive_behavior',
    severity: 'WARNING',
    scope: 'global',
    isMandatory: false,
    description: 'Interactive buttons and form controls should maintain a minimum 44x44px touch target on mobile viewports.',
    explanation: 'Tiny interactive hit targets (<44px) cause accidental taps and fail WCAG 2.1 Success Criterion 2.5.5. Note: Static analysis inspects explicit code tokens and class strings only; it does not measure rendered layout geometry or computed CSS dimensions.',
    remediation: 'Ensure interactive buttons and inputs meet min-h-[44px] min-w-[44px] or have adequate touch padding (minimum 10px 14px).',
    evaluator: (code) => {
      const tinyButtonRegex = /<button[^>]*class\s*=\s*['"][^'"]*\b(?:h-\[?(?:1[0-9]|2[0-4])px\]?|w-\[?(?:1[0-9]|2[0-4])px\]?)\b[^'"]*['"][^>]*>/i;
      const match = tinyButtonRegex.exec(code);
      if (match) {
        return {
          violated: true,
          evidence: match[0].slice(0, 120),
          explanationOverride: 'Interactive trigger declares hardcoded dimensions below the 44px touch target guideline. Note: Static analysis inspects explicit code tokens only and does not measure rendered layout geometry or computed CSS dimensions.',
          isAutomaticallyVerifiable: true
        };
      }
      return { violated: false, isAutomaticallyVerifiable: true };
    }
  },

  // 13. Component Contract: State Completeness Invariants
  {
    id: 'POL-STATE-001',
    name: 'Component State Invariants Handling',
    category: 'interaction_design',
    severity: 'WARNING',
    scope: 'global',
    isMandatory: false,
    description: 'Custom interactive buttons and form controls should account for disabled and loading states.',
    explanation: 'Failing to handle disabled or loading states permits duplicate submissions and lacks visual feedback during async operations. Note: Static analysis checks for direct props/attributes only and cannot inspect external state machine stores or parent event delegation.',
    remediation: 'Include disabled, aria-disabled, or aria-busy handling on interactive controls.',
    evaluator: (code) => {
      if (code.includes('onClick') && code.includes('export function') && code.includes('Button') && !code.includes('disabled') && !code.includes('isLoading') && !code.includes('loading') && !code.includes('aria-busy')) {
        return {
          violated: true,
          evidence: 'Component defines onClick without handling disabled, isLoading, or aria-busy states',
          explanationOverride: 'Interactive button component defines click interaction but omits disabled or loading state handling. Note: Static analysis inspects direct component props and attributes only and cannot verify external state management.',
          isAutomaticallyVerifiable: true
        };
      }
      return { violated: false, isAutomaticallyVerifiable: true };
    }
  }
];
