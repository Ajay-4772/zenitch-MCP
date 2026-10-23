import fs from 'node:fs';
import path from 'node:path';
import {
  DesignSystemGenerationInput,
  DesignSystemGenerationOutput,
  ColorToken,
  TypographyToken,
  SpacingToken,
  RadiusToken,
  ShadowToken,
  BreakpointToken,
  DesignSystemInconsistency
} from '../schemas/design-system.schema.js';
import { inspectProject } from './project-inspector.js';

// --- Color & Accessibility Math ---

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  let cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map(c => c + c).join('');
  }
  if (cleaned.length !== 6 && cleaned.length !== 8) return null;
  const num = parseInt(cleaned.slice(0, 6), 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function getLuminance(rgb: { r: number; g: number; b: number }): number {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(v => {
    const val = v / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function calculateContrastRatio(hex1: string, hex2: string): number {
  const rgb1 = parseHex(hex1);
  const rgb2 = parseHex(hex2);
  if (!rgb1 || !rgb2) return 1.0;
  const lum1 = getLuminance(rgb1);
  const lum2 = getLuminance(rgb2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return Math.round(((brightest + 0.05) / (darkest + 0.05)) * 100) / 100;
}

// --- Token Extraction & Inspection Helpers ---

interface ExtractedToken {
  name: string;
  value: string;
  type: 'color' | 'font' | 'spacing' | 'radius' | 'shadow';
}

function extractTokensFromCss(cssText: string): ExtractedToken[] {
  const tokens: ExtractedToken[] = [];
  const varRegex = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = varRegex.exec(cssText)) !== null) {
    const rawName = match[1].trim();
    const rawValue = match[2].trim();

    let type: ExtractedToken['type'] = 'color';
    if (rawValue.startsWith('#') || rawValue.startsWith('rgb') || rawValue.startsWith('hsl')) {
      type = 'color';
    } else if (rawName.includes('font') || rawValue.includes('sans-serif') || rawValue.includes('serif')) {
      type = 'font';
    } else if (rawName.includes('space') || rawName.includes('spacing') || rawName.includes('gap') || rawName.includes('padding')) {
      type = 'spacing';
    } else if (rawName.includes('radius') || rawName.includes('rounded')) {
      type = 'radius';
    } else if (rawName.includes('shadow')) {
      type = 'shadow';
    }

    tokens.push({
      name: `--${rawName}`,
      value: rawValue,
      type
    });
  }
  return tokens;
}

// --- Domain & Mood Presets ---

interface DomainPalettePreset {
  primaryHex: string;
  primaryHoverHex: string;
  secondaryHex: string;
  backgroundHex: string;
  surfaceHex: string;
  textPrimaryHex: string;
  textMutedHex: string;
  borderHex: string;
  accentHex: string;
  fontHeading: string;
  fontBody: string;
  fontMono: string;
  baseRadius: string;
  elevationShadow: string;
}

function getDomainPreset(domain: string, mood: string): DomainPalettePreset {
  const normalizedDomain = domain.toLowerCase();

  if (mood === 'neo_brutalist') {
    return {
      primaryHex: '#000000',
      primaryHoverHex: '#262626',
      secondaryHex: '#facc15',
      backgroundHex: '#ffffff',
      surfaceHex: '#ffffff',
      textPrimaryHex: '#000000',
      textMutedHex: '#262626',
      borderHex: '#000000',
      accentHex: '#ff3366',
      fontHeading: '"Space Grotesk", "Cabinet Grotesk", sans-serif',
      fontBody: '"Space Grotesk", system-ui, sans-serif',
      fontMono: '"Space Mono", monospace',
      baseRadius: '0px',
      elevationShadow: '4px 4px 0px #000000'
    };
  }

  if (mood === 'dark_modern') {
    return {
      primaryHex: '#38bdf8',
      primaryHoverHex: '#0284c7',
      secondaryHex: '#475569',
      backgroundHex: '#090d16',
      surfaceHex: '#0f172a',
      textPrimaryHex: '#f8fafc',
      textMutedHex: '#94a3b8',
      borderHex: '#1e293b',
      accentHex: '#818cf8',
      fontHeading: '"Geist", "Inter", sans-serif',
      fontBody: '"Geist", "Inter", sans-serif',
      fontMono: '"Fira Code", monospace',
      baseRadius: '4px',
      elevationShadow: '0 0 20px rgba(56, 189, 248, 0.15)'
    };
  }

  if (mood === 'minimal_saas') {
    return {
      primaryHex: '#2563eb',
      primaryHoverHex: '#1d4ed8',
      secondaryHex: '#64748b',
      backgroundHex: '#f8fafc',
      surfaceHex: '#ffffff',
      textPrimaryHex: '#0f172a',
      textMutedHex: '#64748b',
      borderHex: '#e2e8f0',
      accentHex: '#3b82f6',
      fontHeading: '"Inter", -apple-system, sans-serif',
      fontBody: '"Inter", -apple-system, sans-serif',
      fontMono: '"JetBrains Mono", monospace',
      baseRadius: '6px',
      elevationShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
    };
  }

  if (normalizedDomain.includes('editorial') || mood === 'minimal_editorial' || mood === 'editorial') {
    return {
      primaryHex: '#18181b',
      primaryHoverHex: '#27272a',
      secondaryHex: '#52525b',
      backgroundHex: '#fcfbf9',
      surfaceHex: '#ffffff',
      textPrimaryHex: '#1c1917',
      textMutedHex: '#78716c',
      borderHex: '#e7e5e4',
      accentHex: '#991b1b',
      fontHeading: '"Newsreader", "Playfair Display", Georgia, serif',
      fontBody: '"Newsreader", Georgia, serif',
      fontMono: '"Courier Prime", monospace',
      baseRadius: '0px',
      elevationShadow: 'none'
    };
  }

  if (normalizedDomain.includes('health') || mood === 'clinical_precise') {
    return {
      primaryHex: '#075985', // Sky 800 - WCAG AAA (7.23:1 on #f8fafc)
      primaryHoverHex: '#0c4a6e', // Sky 900 (9.04:1 on #f8fafc)
      secondaryHex: '#0f766e', // Teal 700 - clinical sterile balance
      backgroundHex: '#f8fafc',
      surfaceHex: '#ffffff',
      textPrimaryHex: '#0f172a',
      textMutedHex: '#475569',
      borderHex: '#cbd5e1',
      accentHex: '#059669', // Emerald success
      fontHeading: 'Inter, system-ui, -apple-system, sans-serif',
      fontBody: 'Inter, system-ui, -apple-system, sans-serif',
      fontMono: '"JetBrains Mono", Menlo, monospace',
      baseRadius: '4px',
      elevationShadow: '0 1px 3px rgba(15, 23, 42, 0.08)'
    };
  }

  if (normalizedDomain.includes('luxury') || mood === 'luxury_sensory') {
    return {
      primaryHex: '#c5a059', // Warm pale bronze/gold
      primaryHoverHex: '#b38d45',
      secondaryHex: '#27272a', // Zinc 800
      backgroundHex: '#0d0d0f', // Deep dark obsidian
      surfaceHex: '#18181b',
      textPrimaryHex: '#fbfbfb',
      textMutedHex: '#a1a1aa',
      borderHex: '#27272a',
      accentHex: '#d4af37',
      fontHeading: '"Playfair Display", "Cinzel", Georgia, serif',
      fontBody: '"Plus Jakarta Sans", system-ui, sans-serif',
      fontMono: '"Courier Prime", monospace',
      baseRadius: '1px',
      elevationShadow: '0 8px 30px rgba(0, 0, 0, 0.45)'
    };
  }

  if (normalizedDomain.includes('developer') || normalizedDomain.includes('tech')) {
    return {
      primaryHex: '#0ea5e9', // Sky 500
      primaryHoverHex: '#0284c7',
      secondaryHex: '#64748b',
      backgroundHex: '#090d16',
      surfaceHex: '#111827',
      textPrimaryHex: '#f1f5f9',
      textMutedHex: '#94a3b8',
      borderHex: '#1e293b',
      accentHex: '#10b981',
      fontHeading: '"Geist", "Inter", sans-serif',
      fontBody: '"Geist", "Inter", sans-serif',
      fontMono: '"Fira Code", "JetBrains Mono", monospace',
      baseRadius: '4px',
      elevationShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
    };
  }

  if (normalizedDomain.includes('fintech')) {
    return {
      primaryHex: '#047857', // Emerald 700 - financial security
      primaryHoverHex: '#065f46',
      secondaryHex: '#1e293b',
      backgroundHex: '#f8fafc',
      surfaceHex: '#ffffff',
      textPrimaryHex: '#0f172a',
      textMutedHex: '#475569',
      borderHex: '#e2e8f0',
      accentHex: '#0284c7',
      fontHeading: 'Inter, system-ui, sans-serif',
      fontBody: 'Inter, system-ui, sans-serif',
      fontMono: '"Roboto Mono", Menlo, monospace',
      baseRadius: '6px',
      elevationShadow: '0 2px 4px rgba(15, 23, 42, 0.06)'
    };
  }



  if (mood === 'playful_warm') {
    return {
      primaryHex: '#f97316', // Orange 500
      primaryHoverHex: '#ea580c',
      secondaryHex: '#8b5cf6',
      backgroundHex: '#fffbeb',
      surfaceHex: '#ffffff',
      textPrimaryHex: '#1c1917',
      textMutedHex: '#78716c',
      borderHex: '#fde68a',
      accentHex: '#06b6d4',
      fontHeading: '"Outfit", "Plus Jakarta Sans", sans-serif',
      fontBody: '"Inter", system-ui, sans-serif',
      fontMono: '"JetBrains Mono", monospace',
      baseRadius: '12px',
      elevationShadow: '0 4px 12px rgba(249, 115, 22, 0.12)'
    };
  }

  // Default: enterprise_saas / enterprise_solid
  return {
    primaryHex: '#4f46e5', // Indigo 600
    primaryHoverHex: '#4338ca',
    secondaryHex: '#475569',
    backgroundHex: '#f8fafc',
    surfaceHex: '#ffffff',
    textPrimaryHex: '#0f172a',
    textMutedHex: '#64748b',
    borderHex: '#e2e8f0',
    accentHex: '#06b6d4',
    fontHeading: '"Inter", system-ui, -apple-system, sans-serif',
    fontBody: '"Inter", system-ui, -apple-system, sans-serif',
    fontMono: '"JetBrains Mono", monospace',
    baseRadius: '6px',
    elevationShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
  };
}

// --- Main Design System Intelligence Engine ---

export function generateDesignSystem(input: DesignSystemGenerationInput): DesignSystemGenerationOutput {
  const {
    productDomain,
    brandMood = 'enterprise_solid',
    colorMode = 'dual_adaptive',
    preserveExistingTokens = true,
    existingTokensSnippet,
    projectRoot,
    constraints
  } = input;

  const inconsistencies: DesignSystemInconsistency[] = [];

  // 1. Gather existing tokens from projectRoot or snippet
  const extractedTokens: ExtractedToken[] = [];
  if (existingTokensSnippet) {
    extractedTokens.push(...extractTokensFromCss(existingTokensSnippet));
  }

  if (projectRoot) {
    if (fs.existsSync(projectRoot)) {
      try {
        const inspection = inspectProject({ projectRoot, scanDepth: 2 });
        if (inspection.detectedDesignTokens.length > 0) {
          for (const tok of inspection.detectedDesignTokens) {
            extractedTokens.push({
              name: tok.name,
              value: tok.sampleValue || '',
              type: tok.type === 'color' ? 'color' : tok.type === 'radius' ? 'radius' : 'spacing'
            });
          }
        }
      } catch {
        // Fallback silently if inspection encounters read errors
      }
    } else {
      inconsistencies.push({
        type: 'naming_irregularity',
        token: 'projectRoot',
        description: `Project root "${projectRoot}" does not exist or is unreadable. Fallback presets applied.`,
        severity: 'INFO',
        recommendation: 'Provide a valid project path to discover and preserve local styling tokens.'
      });
    }
  }

  // 2. Load domain and mood presets
  const preset = getDomainPreset(productDomain, brandMood);

  // 3. Theme consistency (handling dark_only vs light_only vs dual_adaptive)
  const isDarkTheme = colorMode === 'dark_only' || (preset.backgroundHex.startsWith('#0') || preset.backgroundHex.startsWith('#1'));
  const effectiveBgHex = isDarkTheme ? (preset.backgroundHex.startsWith('#0') ? preset.backgroundHex : '#0f172a') : preset.backgroundHex;
  const effectiveSurfaceHex = isDarkTheme ? (preset.surfaceHex.startsWith('#1') ? preset.surfaceHex : '#1e293b') : preset.surfaceHex;
  const effectiveTextPrimaryHex = isDarkTheme ? '#f8fafc' : preset.textPrimaryHex;
  const effectiveTextMutedHex = isDarkTheme ? '#94a3b8' : preset.textMutedHex;
  const effectiveBorderHex = isDarkTheme ? '#1e293b' : preset.borderHex;

  // 4. Apply custom constraints if specified
  let effectivePrimaryHex = constraints?.customBrandPrimaryHex || preset.primaryHex;
  const targetWcag = constraints?.enforceWcagLevel || (productDomain.toLowerCase().includes('health') ? 'WCAG_AAA' : 'WCAG_AA');
  const minRequiredContrast = targetWcag === 'WCAG_AAA' ? 7.0 : 4.5;

  // 5. Inconsistency Detection on Existing Tokens
  const existingColorHexes = new Map<string, string>(); // hex -> tokenName

  for (const token of extractedTokens) {
    if (token.type === 'color' && token.value.startsWith('#')) {
      const hex = token.value.toLowerCase();
      // Duplicate detection
      if (existingColorHexes.has(hex) && existingColorHexes.get(hex) !== token.name) {
        inconsistencies.push({
          type: 'duplicate_value',
          token: token.name,
          description: `Token ${token.name} has identical hex value (${token.value}) to existing token ${existingColorHexes.get(hex)}.`,
          severity: 'INFO',
          recommendation: `Consolidate ${token.name} into an alias referencing ${existingColorHexes.get(hex)}.`
        });
      } else {
        existingColorHexes.set(hex, token.name);
      }

      // Naming irregularity check
      if (!token.name.startsWith('--color-') && !token.name.startsWith('--brand-') && !token.name.startsWith('--primary')) {
        inconsistencies.push({
          type: 'naming_irregularity',
          token: token.name,
          description: `Token ${token.name} does not follow standard hierarchical prefixing (--color-*).`,
          severity: 'INFO',
          recommendation: `Rename ${token.name} to follow --color-<semantic-role> convention.`
        });
      }
    }
  }

  // 6. Build Preserved vs Proposed Colors
  const rawColorTokens: ColorToken[] = [];

  // Check existing background token
  const existingBg = extractedTokens.find(t => t.name.includes('background') || t.name.includes('bg'));
  const isBgPreserved = preserveExistingTokens && !!existingBg && existingBg.value.startsWith('#');
  const finalBgHex = isBgPreserved ? existingBg!.value : effectiveBgHex;

  // Check existing primary token
  const existingPrimary = extractedTokens.find(t => t.name.includes('primary') || t.name.includes('brand'));
  if (preserveExistingTokens && existingPrimary && existingPrimary.value.startsWith('#')) {
    effectivePrimaryHex = existingPrimary.value;
  }
  const isPrimaryPreserved = preserveExistingTokens && (!!existingPrimary || !!constraints?.customBrandPrimaryHex);

  // Contrast check for primary on background
  const primaryContrast = calculateContrastRatio(effectivePrimaryHex, finalBgHex);
  if (primaryContrast < minRequiredContrast) {
    inconsistencies.push({
      type: 'contrast_violation',
      token: '--color-primary',
      description: `Primary color ${effectivePrimaryHex} yields ${primaryContrast}:1 contrast on ${finalBgHex}, failing ${targetWcag} minimum (${minRequiredContrast}:1).`,
      severity: 'WARNING',
      recommendation: `Darken or lighten primary tone to achieve at least ${minRequiredContrast}:1 contrast.`
    });
  }

  // Check existing surface token
  const existingSurface = extractedTokens.find(t => t.name.includes('surface') || t.name.includes('card'));
  const isSurfacePreserved = preserveExistingTokens && !!existingSurface && existingSurface.value.startsWith('#');
  const finalSurfaceHex = isSurfacePreserved ? existingSurface!.value : effectiveSurfaceHex;

  // Check existing text token
  const existingText = extractedTokens.find(t => t.name.includes('text') && !t.name.includes('muted'));
  const isTextPreserved = preserveExistingTokens && !!existingText && existingText.value.startsWith('#');
  const finalTextHex = isTextPreserved ? existingText!.value : effectiveTextPrimaryHex;

  // Contrast check for text on background
  const textContrast = calculateContrastRatio(finalTextHex, finalBgHex);
  if (textContrast < minRequiredContrast) {
    inconsistencies.push({
      type: 'contrast_violation',
      token: '--color-text-primary',
      description: `Text color ${finalTextHex} yields ${textContrast}:1 contrast on ${finalBgHex}, failing ${targetWcag} minimum (${minRequiredContrast}:1).`,
      severity: 'WARNING',
      recommendation: `Adjust text tone to guarantee ${minRequiredContrast}:1 legibility.`
    });
  }

  // Check existing secondary token
  const existingSecondary = extractedTokens.find(t => t.name.includes('secondary'));
  const isSecPreserved = preserveExistingTokens && !!existingSecondary && existingSecondary.value.startsWith('#');
  const finalSecHex = isSecPreserved ? existingSecondary!.value : preset.secondaryHex;

  // Check existing accent token
  const existingAccent = extractedTokens.find(t => t.name.includes('accent'));
  const isAccentPreserved = preserveExistingTokens && !!existingAccent && existingAccent.value.startsWith('#');
  const finalAccentHex = isAccentPreserved ? existingAccent!.value : preset.accentHex;

  // Populate color tokens in priority order (Essential UI readability first)
  rawColorTokens.push({
    name: '--color-background',
    hex: finalBgHex,
    usage: 'Default page and viewport background',
    contrastOnBackground: 1.0,
    isExisting: isBgPreserved,
    source: isBgPreserved ? 'existing_project' : 'proposed_recommendation'
  });

  rawColorTokens.push({
    name: '--color-surface',
    hex: finalSurfaceHex,
    usage: 'Elevated containers, cards, dialogs, dropdown menus',
    contrastOnBackground: calculateContrastRatio(finalSurfaceHex, finalBgHex),
    isExisting: isSurfacePreserved,
    source: isSurfacePreserved ? 'existing_project' : 'proposed_recommendation'
  });

  rawColorTokens.push({
    name: '--color-text-primary',
    hex: finalTextHex,
    usage: 'High-emphasis readable body text and headings',
    contrastOnBackground: textContrast,
    isExisting: isTextPreserved,
    source: isTextPreserved ? 'existing_project' : 'proposed_recommendation'
  });

  rawColorTokens.push({
    name: '--color-primary',
    hex: effectivePrimaryHex,
    usage: 'Main brand interactive actions, active states, key focus elements',
    contrastOnBackground: primaryContrast,
    isExisting: isPrimaryPreserved,
    source: isPrimaryPreserved ? 'existing_project' : 'proposed_recommendation'
  });

  rawColorTokens.push({
    name: '--color-primary-hover',
    hex: preset.primaryHoverHex,
    usage: 'Hover and pressed states for primary buttons and links',
    contrastOnBackground: calculateContrastRatio(preset.primaryHoverHex, finalBgHex),
    isExisting: false,
    source: 'proposed_recommendation'
  });

  rawColorTokens.push({
    name: '--color-text-muted',
    hex: effectiveTextMutedHex,
    usage: 'Low-emphasis captions, metadata, and helper text',
    contrastOnBackground: calculateContrastRatio(effectiveTextMutedHex, finalBgHex),
    isExisting: false,
    source: 'proposed_recommendation'
  });

  rawColorTokens.push({
    name: '--color-border',
    hex: effectiveBorderHex,
    usage: 'Divider lines, card boundaries, table cell separators',
    contrastOnBackground: calculateContrastRatio(effectiveBorderHex, finalBgHex),
    isExisting: false,
    source: 'proposed_recommendation'
  });

  rawColorTokens.push({
    name: '--color-secondary',
    hex: finalSecHex,
    usage: 'Secondary buttons, badge borders, secondary interactive items',
    contrastOnBackground: calculateContrastRatio(finalSecHex, finalBgHex),
    isExisting: isSecPreserved,
    source: isSecPreserved ? 'existing_project' : 'proposed_recommendation'
  });

  rawColorTokens.push({
    name: '--color-accent',
    hex: finalAccentHex,
    usage: 'Informative badges, status highlights, decorative indicators',
    contrastOnBackground: calculateContrastRatio(finalAccentHex, finalBgHex),
    isExisting: isAccentPreserved,
    source: isAccentPreserved ? 'existing_project' : 'proposed_recommendation'
  });

  // Apply maxColors constraint safely without sacrificing essential reading tokens
  let filteredColorTokens = rawColorTokens;
  if (constraints?.maxColors && constraints.maxColors < rawColorTokens.length) {
    filteredColorTokens = rawColorTokens.slice(0, constraints.maxColors);
  }

  // 7. Typography Tokens with Preservation
  const existingHeadingFont = extractedTokens.find(t => t.name.includes('font-heading') || t.name.includes('font-title'));
  const isHeadingFontPreserved = preserveExistingTokens && !!existingHeadingFont;
  const finalHeadingFont = isHeadingFontPreserved ? existingHeadingFont!.value : preset.fontHeading;

  const existingBodyFont = extractedTokens.find(t => t.name.includes('font-body') || t.name.includes('font-sans'));
  const isBodyFontPreserved = preserveExistingTokens && !!existingBodyFont;
  const finalBodyFont = isBodyFontPreserved ? existingBodyFont!.value : preset.fontBody;

  const baseSize = constraints?.preferredBaseFontSize || 16;
  const typographyTokens: TypographyToken[] = [
    {
      role: 'display',
      fontFamily: finalHeadingFont,
      sizes: {
        '2xl': `${(baseSize * 2.25) / 16}rem`,
        '3xl': `${(baseSize * 3.0) / 16}rem`
      },
      weights: [700, 800],
      lineHeights: { 'tight': '1.1', 'none': '1.0' },
      isExisting: isHeadingFontPreserved,
      source: isHeadingFontPreserved ? 'existing_project' : 'proposed_recommendation'
    },
    {
      role: 'heading',
      fontFamily: finalHeadingFont,
      sizes: {
        'h1': `${(baseSize * 1.875) / 16}rem`,
        'h2': `${(baseSize * 1.5) / 16}rem`,
        'h3': `${(baseSize * 1.25) / 16}rem`
      },
      weights: [600, 700],
      lineHeights: { 'snug': '1.25', 'normal': '1.35' },
      isExisting: isHeadingFontPreserved,
      source: isHeadingFontPreserved ? 'existing_project' : 'proposed_recommendation'
    },
    {
      role: 'body',
      fontFamily: finalBodyFont,
      sizes: {
        'sm': `${(baseSize * 0.875) / 16}rem`,
        'base': `${baseSize / 16}rem`,
        'lg': `${(baseSize * 1.125) / 16}rem`
      },
      weights: [400, 500],
      lineHeights: { 'normal': '1.5', 'relaxed': '1.625' },
      isExisting: isBodyFontPreserved,
      source: isBodyFontPreserved ? 'existing_project' : 'proposed_recommendation'
    },
    {
      role: 'caption',
      fontFamily: finalBodyFont,
      sizes: {
        'xs': `${(baseSize * 0.75) / 16}rem`
      },
      weights: [400, 500],
      lineHeights: { 'normal': '1.4' },
      isExisting: isBodyFontPreserved,
      source: isBodyFontPreserved ? 'existing_project' : 'proposed_recommendation'
    },
    {
      role: 'mono',
      fontFamily: preset.fontMono,
      sizes: {
        'code': `${(baseSize * 0.875) / 16}rem`
      },
      weights: [400, 600],
      lineHeights: { 'code': '1.45' },
      isExisting: false,
      source: 'proposed_recommendation'
    }
  ];

  // 8. Spacing Tokens
  const spacingTokens: SpacingToken[] = [
    { name: '--spacing-1', value: '4px', pixelEquivalent: 4, usage: 'Micro gaps, badge padding' },
    { name: '--spacing-2', value: '8px', pixelEquivalent: 8, usage: 'Tight button padding, icon gaps' },
    { name: '--spacing-3', value: '12px', pixelEquivalent: 12, usage: 'Standard input horizontal padding' },
    { name: '--spacing-4', value: '16px', pixelEquivalent: 16, usage: 'Card padding, regular component margins' },
    { name: '--spacing-6', value: '24px', pixelEquivalent: 24, usage: 'Section gutters, layout grid gaps' },
    { name: '--spacing-8', value: '32px', pixelEquivalent: 32, usage: 'Major panel spacing' },
    { name: '--spacing-12', value: '48px', pixelEquivalent: 48, usage: 'Page section vertical rhythm' }
  ];
  const spacingScale = spacingTokens.map(s => s.value);

  // 9. Border Radius Tokens
  const parsedRad = parseInt(preset.baseRadius, 10);
  const baseRadPx = Number.isNaN(parsedRad) ? 4 : parsedRad;
  const borderRadiusTokens: RadiusToken[] = [
    { name: '--radius-none', value: '0px', usage: 'Sharp boundaries, square badges' },
    { name: '--radius-sm', value: `${Math.max(0, baseRadPx - 2)}px`, usage: 'Inputs, compact tags' },
    { name: '--radius-md', value: `${baseRadPx}px`, usage: 'Standard buttons, interactive cards' },
    { name: '--radius-lg', value: `${baseRadPx * 2}px`, usage: 'Modals, flyouts, floating panels' },
    { name: '--radius-full', value: '9999px', usage: 'Pill avatars, round indicators' }
  ];

  // 10. Shadows
  const shadowTokens: ShadowToken[] = [
    { name: '--shadow-sm', value: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', elevation: '1dp' },
    { name: '--shadow-md', value: preset.elevationShadow, elevation: '3dp' },
    { name: '--shadow-lg', value: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', elevation: '6dp' },
    { name: '--shadow-xl', value: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', elevation: '12dp' }
  ];

  // 11. Breakpoints
  const breakpointTokens: BreakpointToken[] = [
    { name: 'sm', minWidth: '640px', targetDevice: 'Mobile landscape / Small tablets' },
    { name: 'md', minWidth: '768px', targetDevice: 'Tablets portrait' },
    { name: 'lg', minWidth: '1024px', targetDevice: 'Desktop workstations' },
    { name: 'xl', minWidth: '1280px', targetDevice: 'Widescreen monitors' },
    { name: '2xl', minWidth: '1536px', targetDevice: 'Ultra-wide displays' }
  ];

  // 12. Accurate Empirical Accessibility Compliance Rating
  const hasContrastViolation = inconsistencies.some(i => i.type === 'contrast_violation');
  const meetsAaaContrast = textContrast >= 7.0 && primaryContrast >= 4.5 && !hasContrastViolation;
  const a11yComplianceRating = (targetWcag === 'WCAG_AAA' && meetsAaaContrast) ? 'WCAG_AAA' : 'WCAG_AA';

  // 13. CSS Variables Export Generation
  const cssLines: string[] = [
    '/* Zenitch Generated Design Tokens */',
    `:root {`,
    '  /* Colors */',
    ...filteredColorTokens.map(c => `  ${c.name}: ${c.hex}; /* ${c.usage} */`),
    '',
    '  /* Typography */',
    `  --font-heading: ${finalHeadingFont};`,
    `  --font-body: ${finalBodyFont};`,
    `  --font-mono: ${preset.fontMono};`,
    '',
    '  /* Spacing */',
    ...spacingTokens.map(s => `  ${s.name}: ${s.value};`),
    '',
    '  /* Border Radius */',
    ...borderRadiusTokens.map(r => `  ${r.name}: ${r.value};`),
    '',
    '  /* Shadows */',
    ...shadowTokens.map(sh => `  ${sh.name}: ${sh.value};`),
    '}'
  ];

  if (colorMode === 'dual_adaptive' && !constraints?.preventDarkTheme) {
    cssLines.push(
      '',
      '@media (prefers-color-scheme: dark) {',
      '  :root {',
      '    --color-background: #090d16;',
      '    --color-surface: #111827;',
      '    --color-text-primary: #f8fafc;',
      '    --color-text-muted: #94a3b8;',
      '    --color-border: #1e293b;',
      '  }',
      '}'
    );
  }

  const cssVariablesExport = cssLines.join('\n');

  // 14. Tailwind Config Export Generation
  const tailwindConfig = {
    theme: {
      extend: {
        colors: {
          primary: {
            DEFAULT: filteredColorTokens.find(c => c.name === '--color-primary')?.hex || preset.primaryHex,
            hover: preset.primaryHoverHex
          },
          secondary: finalSecHex,
          background: 'var(--color-background)',
          surface: 'var(--color-surface)',
          border: 'var(--color-border)',
          accent: finalAccentHex
        },
        fontFamily: {
          sans: [finalBodyFont],
          heading: [finalHeadingFont],
          mono: [preset.fontMono]
        },
        borderRadius: {
          sm: borderRadiusTokens.find(r => r.name === '--radius-sm')?.value || '2px',
          DEFAULT: borderRadiusTokens.find(r => r.name === '--radius-md')?.value || '4px',
          lg: borderRadiusTokens.find(r => r.name === '--radius-lg')?.value || '8px'
        }
      }
    }
  };
  const tailwindConfigExport = `// tailwind.config.js snippet\nmodule.exports = ${JSON.stringify(tailwindConfig, null, 2)};`;

  // 15. Accurate Token Origins Count
  const preservedCount = filteredColorTokens.filter(c => c.isExisting).length + typographyTokens.filter(t => t.isExisting).length;
  const proposedCount = filteredColorTokens.filter(c => !c.isExisting).length + typographyTokens.filter(t => !t.isExisting).length;

  // 16. System Name & Rationale
  const domainTitle = productDomain.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  const systemName = `${domainTitle} ${brandMood.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Design System`;

  const rationalExplanation = [
    `Engineered design tokens tailored for ${productDomain} with ${brandMood.replace('_', ' ')} visual identity.`,
    `- Accessibility Rating: ${a11yComplianceRating} (Calculated Primary: ${primaryContrast}:1, Text: ${textContrast}:1 on ${finalBgHex}).`,
    `- Brand Token Preservation: ${preservedCount} token(s) preserved from existing project or user constraints.`,
    `- Typography Hierarchy: Paired ${finalHeadingFont} (heading) with ${finalBodyFont} (body).`,
    `- Density & Spacing: Adopted ${preset.baseRadius} base radius and an 8-point harmonic spacing scale suited for ergonomic data scanning.`,
    constraints?.preventDarkTheme ? '- Theme Constraint: Dark mode generation disabled per preventDarkTheme directive.' : '',
    inconsistencies.length > 0 ? `- Inconsistency Audit: Identified ${inconsistencies.length} potential issue(s) requiring attention.` : `- Inconsistency Audit: Clean token structure with zero violations.`
  ].filter(Boolean).join('\n');

  return {
    systemName,
    colorTokens: filteredColorTokens,
    typographyTokens,
    spacingScale,
    spacingTokens,
    borderRadiusTokens,
    shadowTokens,
    breakpointTokens,
    otherProperties: {
      zIndices: {
        dropdown: 1000,
        sticky: 1020,
        modalBackdrop: 1040,
        modal: 1050,
        popover: 1060,
        tooltip: 1070
      },
      transitions: {
        fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
        normal: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
        slow: '350ms cubic-bezier(0.4, 0, 0.2, 1)'
      }
    },
    cssVariablesExport,
    tailwindConfigExport,
    a11yComplianceRating,
    inconsistenciesIdentified: inconsistencies,
    rationalExplanation,
    tokenOrigins: {
      preservedCount,
      proposedCount
    }
  };
}
