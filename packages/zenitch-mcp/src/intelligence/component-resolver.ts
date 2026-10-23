import fs from 'node:fs';
import path from 'node:path';
import {
  ComponentResolutionInput,
  ComponentResolutionOutput,
  DiscoveredComponentDetail,
  DuplicateComponentWarning,
  ComponentType
} from '../schemas/component.schema.js';
import { inspectProject } from './project-inspector.js';
import { getComponentContract } from './component-contracts.js';

// --- Stopwords & Compound Subcomponents ---

const QUERY_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'view', 'page', 'into', 'user', 'app', 'component'
]);

const COMPOUND_SUBCOMPONENT_SUFFIXES = new Set([
  'header', 'footer', 'title', 'description', 'content', 'trigger', 'item', 'row', 'cell',
  'body', 'overlay', 'portal', 'close', 'group', 'list', 'root', 'separator', 'column', 'action'
]);

// --- Reusable Primitive & Responsibility Knowledge Base ---

interface PrimitiveKnowledge {
  keywords: string[];
  type: ComponentType;
  defaultResponsibilities: string[];
  defaultProps: Record<string, any>;
  sampleSnippet: (framework: string, name: string) => string;
}

const PRIMITIVE_DICTIONARY: Record<string, PrimitiveKnowledge> = {
  button: {
    keywords: ['button', 'btn', 'cta', 'action', 'submit', 'trigger', 'clickable'],
    type: 'ui_primitive',
    defaultResponsibilities: ['Trigger primary or secondary user actions', 'Display loading state spinner', 'Provide keyboard focus ring'],
    defaultProps: { variant: 'primary', size: 'md', disabled: false, isLoading: false },
    sampleSnippet: (fw, name) => `<${name} variant="primary" onClick={handleClick}>Submit</${name}>`
  },
  input: {
    keywords: ['input', 'text field', 'textfield', 'textbox', 'searchbox', 'form control', 'type text'],
    type: 'ui_primitive',
    defaultResponsibilities: ['Capture user textual input', 'Render validation error messaging', 'Accessible label binding'],
    defaultProps: { type: 'text', placeholder: 'Enter value...', isInvalid: false },
    sampleSnippet: (fw, name) => `<${name} placeholder="Enter value..." aria-label="Input field" />`
  },
  modal: {
    keywords: ['modal', 'dialog', 'popup', 'alertdialog', 'prompt', 'drawer', 'overlay'],
    type: 'ui_primitive',
    defaultResponsibilities: ['Render focused contextual dialog', 'Trap keyboard focus inside overlay', 'Close on Escape key press'],
    defaultProps: { isOpen: true, onClose: '() => {}', title: 'Dialog Title' },
    sampleSnippet: (fw, name) => `<${name} isOpen={isOpen} onClose={() => setIsOpen(false)} title="Confirm Action">\n  <p>Are you sure?</p>\n</${name}>`
  },
  badge: {
    keywords: ['badge', 'tag', 'pill', 'chip', 'status indicator'],
    type: 'ui_primitive',
    defaultResponsibilities: ['Display status or count indicator', 'Visual categorization'],
    defaultProps: { variant: 'neutral', children: 'Status' },
    sampleSnippet: (fw, name) => `<${name} variant="success">Active</${name}>`
  },
  card: {
    keywords: ['card', 'panel', 'tile', 'box', 'container', 'surface'],
    type: 'ui_primitive',
    defaultResponsibilities: ['Encapsulate content and actions for a single subject', 'Provide elevated border and padding'],
    defaultProps: { padding: 'md', elevated: true },
    sampleSnippet: (fw, name) => `<${name}>\n  <h3>Card Title</h3>\n  <p>Card content goes here.</p>\n</${name}>`
  },
  tabs: {
    keywords: ['tab', 'tabs', 'tablist', 'tabpanel', 'tabbed', 'segmented control', 'nav tabs'],
    type: 'composite',
    defaultResponsibilities: ['Provide multi-panel view switching', 'Manage aria-selected and aria-controls state', 'Support keyboard Arrow navigation'],
    defaultProps: { defaultActiveTab: 'overview', orientation: 'horizontal' },
    sampleSnippet: (fw, name) => `<${name} tabs={[{ id: 't1', label: 'Overview' }, { id: 't2', label: 'Details' }]} activeTab="t1" onTabChange={setActiveTab} />`
  },
  table: {
    keywords: ['table', 'grid', 'datatable', 'matrix', 'data grid', 'rows and columns'],
    type: 'composite',
    defaultResponsibilities: ['Tabular data rendering', 'Column sorting and pagination', 'Accessible table header semantics'],
    defaultProps: { data: [], columns: [], isStriped: true },
    sampleSnippet: (fw, name) => `<${name} data={items} columns={columns} />`
  },
  dropdown: {
    keywords: ['dropdown', 'select', 'menu', 'combobox', 'options list'],
    type: 'ui_primitive',
    defaultResponsibilities: ['Provide selection options from toggled overlay', 'Accessible ARIA combobox state'],
    defaultProps: { options: [], onSelect: '() => {}' },
    sampleSnippet: (fw, name) => `<${name} options={options} onSelect={handleSelect} placeholder="Select an option..." />`
  },
  avatar: {
    keywords: ['avatar', 'profile image', 'user icon', 'photo thumbnail'],
    type: 'ui_primitive',
    defaultResponsibilities: ['Render user circular photo with fallback initials', 'Accessible image alt description'],
    defaultProps: { src: '/user.png', alt: 'User avatar', size: 'md' },
    sampleSnippet: (fw, name) => `<${name} src={user.avatarUrl} alt={user.name} fallback="JD" />`
  }
};

// --- Helper Functions ---

function extractExportsAndResponsibilities(filePath: string, content: string): { exports: string[]; responsibilities: string[] } {
  const exports: string[] = [];
  const responsibilities: string[] = [];

  // Match export default function / const / class
  const defaultExportMatch = content.match(/export\s+default\s+(?:function|const|class)?\s*([a-zA-Z0-9_$]+)?/);
  if (defaultExportMatch && defaultExportMatch[1]) {
    exports.push(defaultExportMatch[1]);
  } else if (content.includes('export default')) {
    exports.push('default');
  }

  // Match named exports
  const namedExportMatches = content.matchAll(/export\s+(?:const|function|interface|type|class)\s+([a-zA-Z0-9_$]+)/g);
  for (const match of namedExportMatches) {
    if (match[1] && !exports.includes(match[1])) {
      exports.push(match[1]);
    }
  }

  // Infer responsibilities from hooks, props and handlers
  if (content.includes('onClick') || content.includes('handleSubmit') || content.includes('disabled')) {
    responsibilities.push('Handles user click interactions and submit events');
  }
  if (content.includes('aria-') || content.includes('role=') || content.includes('focus()')) {
    responsibilities.push('Maintains accessible ARIA attributes and focus management');
  }
  if (content.includes('useState') || content.includes('ref(') || content.includes('writable(')) {
    responsibilities.push('Maintains internal reactive component state');
  }
  if (content.includes('isLoading') || content.includes('loading') || content.includes('spinner')) {
    responsibilities.push('Provides visual loading and progress feedback');
  }
  if (content.includes('children') || content.includes('<slot') || content.includes('props.content')) {
    responsibilities.push('Acts as a wrapper container for arbitrary child elements');
  }

  if (responsibilities.length === 0) {
    responsibilities.push('Visual presentation component');
  }

  return { exports, responsibilities };
}

// --- Component Resolver Subsystem ---

export function resolveComponent(input: ComponentResolutionInput): ComponentResolutionOutput {
  const {
    requestedFunctionality,
    targetPageOrView = 'General',
    projectRoot,
    enforceReuse = true,
    frameworkHint,
    existingComponentsOverride,
    styleDirection
  } = input;

  // Retrieve only the requested component contract in O(1) time
  const matchedContract = getComponentContract(requestedFunctionality);

  const VALID_STYLES = new Set(['minimal_saas', 'dark_modern', 'editorial', 'neo_brutalist']);
  let styleWarning = '';
  const isStyleValid = styleDirection && VALID_STYLES.has(styleDirection);
  if (styleDirection && !isStyleValid) {
    styleWarning = `Warning: Requested styleDirection "${styleDirection}" is unsupported. Valid directions are: minimal_saas, dark_modern, editorial, neo_brutalist.`;
  }

  const reqLower = requestedFunctionality.toLowerCase();

  // 1. Discover Project Components
  let discoveredComponents: DiscoveredComponentDetail[] = [];
  let detectedFramework = frameworkHint || 'react_typescript';
  let pathWarning = '';

  if (existingComponentsOverride && existingComponentsOverride.length > 0) {
    discoveredComponents = existingComponentsOverride.map(c => ({
      name: c.name,
      filePath: c.filePath,
      type: c.type,
      exports: c.exports || [c.name],
      responsibilities: c.responsibilities || ['Interactive UI element'],
      matchScore: 0
    }));
  } else if (projectRoot) {
    if (fs.existsSync(projectRoot)) {
      try {
        const inspection = inspectProject({ projectRoot, scanDepth: 3 });
        detectedFramework = inspection.framework !== 'unknown' ? inspection.framework : detectedFramework;

        for (const comp of inspection.discoveredComponents) {
          const fullPath = path.isAbsolute(comp.filePath) ? comp.filePath : path.join(projectRoot, comp.filePath);
          let exportsList: string[] = [comp.name];
          let respList: string[] = [];

          if (fs.existsSync(fullPath)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const extracted = extractExportsAndResponsibilities(fullPath, content);
              exportsList = extracted.exports.length > 0 ? extracted.exports : exportsList;
              respList = extracted.responsibilities;
            } catch {
              // Read fallback
            }
          }

          discoveredComponents.push({
            name: comp.name,
            filePath: comp.filePath,
            type: comp.type,
            exports: exportsList,
            responsibilities: respList.length > 0 ? respList : ['Reusable interface element'],
            matchScore: 0
          });
        }
      } catch {
        // Fallback if inspection fails
      }
    } else {
      pathWarning = `Provided projectRoot "${projectRoot}" does not exist. Using fallback primitives.`;
    }
  }

  // 2. Identify Potential Duplicate Components (With False-Positive Suppression)
  const detectedDuplicates: DuplicateComponentWarning[] = [];
  for (let i = 0; i < discoveredComponents.length; i++) {
    for (let j = i + 1; j < discoveredComponents.length; j++) {
      const compA = discoveredComponents[i];
      const compB = discoveredComponents[j];
      const nameA = compA.name.toLowerCase();
      const nameB = compB.name.toLowerCase();

      // Check if one is a legitimate compound subcomponent of the other (e.g. Card vs CardHeader)
      const isSubcomponentOfA = nameB.startsWith(nameA) && COMPOUND_SUBCOMPONENT_SUFFIXES.has(nameB.slice(nameA.length));
      const isSubcomponentOfB = nameA.startsWith(nameB) && COMPOUND_SUBCOMPONENT_SUFFIXES.has(nameA.slice(nameB.length));

      if (isSubcomponentOfA || isSubcomponentOfB) {
        // Legitimate compound subcomponents -> Skip, NOT duplicates
        continue;
      }

      // Check if both are variants of the same primitive or share identical root names
      const isBothButtons = nameA.includes('button') && nameB.includes('button');
      const isBothModals = (nameA.includes('modal') || nameA.includes('dialog')) && (nameB.includes('modal') || nameB.includes('dialog'));
      const isBothDropdowns = (nameA.includes('dropdown') || nameA.includes('select')) && (nameB.includes('dropdown') || nameB.includes('select'));
      const isPrefixVariant = (nameA.endsWith(nameB) || nameB.endsWith(nameA)) && nameA !== nameB;

      if (isBothButtons || isBothModals || isBothDropdowns || isPrefixVariant) {
        detectedDuplicates.push({
          componentA: compA.name,
          fileA: compA.filePath,
          componentB: compB.name,
          fileB: compB.filePath,
          similarityReason: `Both components appear to serve overlapping functional roles (${compA.name} vs ${compB.name}).`,
          recommendation: `Consolidate ${compB.name} into ${compA.name} using variant props to prevent maintenance divergence.`
        });
      }
    }
  }

  // 3. Match Request against Discovered Components & Known Primitives
  let bestMatch: { component: DiscoveredComponentDetail; score: number } | null = null;
  const matchedPrimitives: string[] = [];

  const queryTokens = reqLower
    .split(/[\s,._-]+/)
    .filter(t => t.length > 2 && !QUERY_STOPWORDS.has(t));

  for (const comp of discoveredComponents) {
    let score = 0;
    const compNameLower = comp.name.toLowerCase();

    // Exact match
    if (compNameLower === reqLower) {
      score = 0.95;
    } else {
      // Meaningful query token overlap
      for (const token of queryTokens) {
        if (compNameLower.includes(token)) {
          score += 0.4;
        }
      }

      // Check Primitive Dictionary keywords
      for (const [primKey, primInfo] of Object.entries(PRIMITIVE_DICTIONARY)) {
        if (compNameLower.includes(primKey)) {
          const matchesQuery = primInfo.keywords.some(k => reqLower.includes(k));
          if (matchesQuery) {
            score += 0.5;
            if (!matchedPrimitives.includes(primKey)) {
              matchedPrimitives.push(primKey);
            }
          }
        }
      }

      // Check inferred component responsibilities
      for (const resp of comp.responsibilities) {
        const respLower = resp.toLowerCase();
        if (queryTokens.some(t => respLower.includes(t))) {
          score += 0.15;
        }
      }
    }

    comp.matchScore = Math.min(1.0, Math.round(score * 100) / 100);
    if (!bestMatch || comp.matchScore > bestMatch.score) {
      bestMatch = { component: comp, score: comp.matchScore };
    }
  }

  // Check if query matches a known primitive even if not present in discovered components
  if (matchedPrimitives.length === 0) {
    for (const [primKey, primInfo] of Object.entries(PRIMITIVE_DICTIONARY)) {
      if (primInfo.keywords.some(k => reqLower.includes(k))) {
        matchedPrimitives.push(primKey);
      }
    }
  }

  // 4. Resolution Decision Engine
  // A: Reuse Existing
  if (bestMatch && bestMatch.score >= 0.5 && enforceReuse) {
    const targetComp = bestMatch.component;
    const primKey = Object.keys(PRIMITIVE_DICTIONARY).find(k => targetComp.name.toLowerCase().includes(k)) || 'button';
    const dictEntry = PRIMITIVE_DICTIONARY[primKey];

    const sourcePath = targetComp.filePath.startsWith('./') ? targetComp.filePath : `./${targetComp.filePath}`;
    const cleanImportPath = sourcePath.replace(/\\/g, '/').replace(/\.[^/.]+$/, '');
    const codeSnippet = `import { ${targetComp.name} } from '${cleanImportPath}';\n\n// Usage in ${targetPageOrView}\n${dictEntry ? dictEntry.sampleSnippet(detectedFramework, targetComp.name) : `<${targetComp.name} />`}`;

    const reuseProps: Record<string, any> = dictEntry ? { ...dictEntry.defaultProps } : { className: 'w-full' };
    if (styleDirection && matchedContract?.styleAdaptations[styleDirection]) {
      reuseProps.styleDirection = styleDirection;
      reuseProps.designTokens = matchedContract.styleAdaptations[styleDirection].tokens;
    }

    return {
      resolutionType: 'REUSE_EXISTING',
      recommendedComponent: {
        name: targetComp.name,
        sourcePath: targetComp.filePath,
        propsToPass: reuseProps,
        codeSnippet,
        exportsUsed: targetComp.exports.slice(0, 3)
      },
      componentContract: matchedContract,
      rationalExplanation: `Discovered existing high-confidence component "${targetComp.name}" (${Math.round(bestMatch.score * 100)}% match) at "${targetComp.filePath}". Reusing this component preserves visual consistency, minimizes bundle bloat, and respects existing project conventions.`,
      preventedDuplicationOf: `Prevented authoring redundant new component for "${requestedFunctionality}" when "${targetComp.name}" already satisfies this requirement.`,
      evidence: {
        matchedPrimitives,
        confidenceScore: bestMatch.score,
        frameworkConventions: [`Target framework: ${detectedFramework}.`, pathWarning, styleWarning].filter(Boolean).join(' ')
      },
      detectedDuplicates,
      discoveredProjectComponents: discoveredComponents,
      isNewComponentJustified: false
    };
  }

  // B: Extend Existing
  if (bestMatch && bestMatch.score >= 0.3 && enforceReuse) {
    const targetComp = bestMatch.component;
    const cleanImportPath = targetComp.filePath.replace(/\\/g, '/').replace(/\.[^/.]+$/, '');
    const codeSnippet = `import { ${targetComp.name} } from './${cleanImportPath}';\n\n// Extend with specialized props rather than rewriting from scratch\nexport function Specialized${targetComp.name}(props: any) {\n  return <${targetComp.name} {...props} />;\n}`;

    const extendProps: Record<string, any> = { extended: true };
    if (styleDirection && matchedContract?.styleAdaptations[styleDirection]) {
      extendProps.styleDirection = styleDirection;
      extendProps.designTokens = matchedContract.styleAdaptations[styleDirection].tokens;
    }

    return {
      resolutionType: 'EXTEND_EXISTING',
      recommendedComponent: {
        name: targetComp.name,
        sourcePath: targetComp.filePath,
        propsToPass: extendProps,
        codeSnippet,
        exportsUsed: targetComp.exports
      },
      componentContract: matchedContract,
      rationalExplanation: `Existing component "${targetComp.name}" closely aligns with the requirements but may require additional prop extensions. Extending it avoids code divergence while fulfilling the target workflow.`,
      preventedDuplicationOf: `Prevented authoring duplicate sibling component when "${targetComp.name}" can be extended.`,
      evidence: {
        matchedPrimitives,
        confidenceScore: bestMatch.score,
        frameworkConventions: [`Target framework: ${detectedFramework}.`, pathWarning, styleWarning].filter(Boolean).join(' ')
      },
      detectedDuplicates,
      discoveredProjectComponents: discoveredComponents,
      isNewComponentJustified: false
    };
  }

  // C: Scaffold New (Genuinely Necessary)
  const sanitizedName = requestedFunctionality
    .split(/[\s_-]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '');
  const compName = sanitizedName.length > 2 ? sanitizedName : 'CustomWidget';

  let newComponentSnippet = '';
  if (detectedFramework.includes('next') || detectedFramework.includes('react')) {
    const isInteractive = reqLower.includes('click') || reqLower.includes('interactive') || reqLower.includes('form') || reqLower.includes('toggle') || reqLower.includes('canvas') || reqLower.includes('particle') || reqLower.includes('3d') || reqLower.includes('animation') || reqLower.includes('chart');
    const clientDirective = detectedFramework.includes('next') && isInteractive ? `'use client';\n\n` : '';
    newComponentSnippet = `${clientDirective}import React from 'react';

export interface ${compName}Props {
  className?: string;
  children?: React.ReactNode;
}

/**
 * ${compName}
 * Purpose: ${requestedFunctionality}
 * Target View: ${targetPageOrView}
 */
export function ${compName}({ className = '', children }: ${compName}Props) {
  return (
    <div className={\`zenitch-${compName.toLowerCase()} \${className}\`}>
      {children}
    </div>
  );
}
`;
  } else if (detectedFramework.includes('vue')) {
    newComponentSnippet = `<template>
  <div :class="['zenitch-${compName.toLowerCase()}', className]">
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * ${compName}
 * Purpose: ${requestedFunctionality}
 */
defineProps<{
  className?: string;
}>();
</script>`;
  } else if (detectedFramework.includes('svelte')) {
    newComponentSnippet = `<!-- ${compName}.svelte -->
<script lang="ts">
  let { class: className = '', children } = $props();
</script>

<div class={\`zenitch-${compName.toLowerCase()} \${className}\`}>
  {@render children?.()}
</div>`;
  } else {
    newComponentSnippet = `<!-- ${compName}: ${requestedFunctionality} -->\n<section class="zenitch-${compName.toLowerCase()}" aria-label="${compName}">\n  <!-- Content -->\n</section>`;
  }

  const scaffoldProps: Record<string, any> = { className: '' };
  if (styleDirection && matchedContract?.styleAdaptations[styleDirection]) {
    scaffoldProps.styleDirection = styleDirection;
    scaffoldProps.designTokens = matchedContract.styleAdaptations[styleDirection].tokens;
  }

  return {
    resolutionType: 'SCAFFOLD_NEW',
    recommendedComponent: {
      name: compName,
      codeSnippet: newComponentSnippet,
      propsToPass: scaffoldProps,
      exportsUsed: [compName]
    },
    componentContract: matchedContract,
    rationalExplanation: `No existing component or UI primitive in the project satisfies "${requestedFunctionality}". Authoring a new component is genuinely necessary to fulfill this requirement without overloading unrelated primitives.`,
    evidence: {
      matchedPrimitives,
      confidenceScore: 0.1,
      frameworkConventions: [
        `Scaffolded for framework "${detectedFramework}" following clean architectural boundaries.`,
        pathWarning,
        styleWarning
      ].filter(Boolean).join(' ')
    },
    detectedDuplicates,
    discoveredProjectComponents: discoveredComponents,
    isNewComponentJustified: true
  };
}
