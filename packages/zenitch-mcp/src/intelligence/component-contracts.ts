import { ComponentContract, StyleDirection } from '../schemas/component.schema.js';

/**
 * Standard Component Contracts
 * Compact, deterministic, verified design contracts for core UI primitives.
 * Provides structural, accessibility, interactive state, and responsive rules
 * while allowing independent visual styling across multiple aesthetics.
 */
export const COMPONENT_CONTRACTS: Record<string, ComponentContract> = {
  button: {
    componentId: 'button',
    name: 'Button',
    category: 'ui_primitive',
    structure: {
      semanticElement: '<button type="button|submit|reset">',
      slots: {
        prefixIcon: 'Optional leading icon placed before the label text',
        label: 'Mandatory accessible label or text content',
        suffixIcon: 'Optional trailing icon placed after the label text',
        loadingSpinner: 'Indeterminate progress indicator shown during active async operations'
      },
      containerHierarchy: '<button class="btn"><span class="btn-prefix"></span><span class="btn-label"></span><span class="btn-suffix"></span></button>'
    },
    accessibility: {
      role: 'button',
      requiredAttributes: [
        'aria-label (mandatory if icon-only button without text content)',
        'aria-busy="true" (mandatory when async action is pending)',
        'aria-disabled="true" (when styled as disabled without native disabled attribute)',
        'disabled (native attribute to suppress keyboard and pointer events)'
      ],
      keyboardInteractions: [
        'Enter: triggers the button action',
        'Space: triggers the button action',
        'Tab: moves focus into and out of the button in natural DOM order'
      ],
      focusManagement: 'Must render a high-contrast focus ring with >=2px offset on :focus-visible. Never disable outline without providing an accessible alternative.',
      touchTarget: {
        minWidth: '44px',
        minHeight: '44px',
        standard: 'WCAG 2.1 SC 2.5.5 (Target Size) & SC 2.5.8 (Target Size Minimum)'
      }
    },
    interactionStates: {
      supportedStates: ['idle', 'hover', 'active', 'focus_visible', 'disabled', 'loading'],
      stateInvariants: {
        idle: 'Default interactive state with primary/secondary contrast conforming to WCAG AA (>=4.5:1).',
        hover: 'Visual feedback within 150ms transition (tint/shade shift); cursor: pointer.',
        active: 'Immediate pressed feedback (:active); subtle downward or shadow reduction.',
        focus_visible: 'Distinctive focus ring (minimum 3:1 contrast against surrounding surface) visible only during keyboard navigation.',
        disabled: 'cursor: not-allowed; opacity <= 0.6; pointer-events suppressed; click handlers ignored.',
        loading: 'aria-busy="true"; width and height preserved to prevent cumulative layout shift (CLS); pointer events disabled.'
      }
    },
    responsive: {
      mobile: 'Expand to 100% container width (w-full) in mobile viewports (<640px) or stack in action sheets; minimum 44px touch target enforced.',
      desktop: 'Inline-flex display with auto width and structured horizontal padding (16px to 24px).',
      overflow: 'Text overflow truncated with ellipsis or wrapping configured to prevent layout overflow.'
    },
    styleAdaptations: {
      minimal_saas: {
        visualTheme: 'Clean, understated, functional enterprise aesthetic',
        tokens: {
          background: 'var(--color-primary, #2563eb)',
          color: '#ffffff',
          border: '1px solid transparent',
          borderRadius: '6px',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
          hoverBackground: '#1d4ed8',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          padding: '10px 16px',
          fontWeight: '500'
        }
      },
      dark_modern: {
        visualTheme: 'Deep obsidian, luminous accent, crisp dark glass aesthetic',
        tokens: {
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          color: '#f8fafc',
          border: '1px solid #334155',
          borderRadius: '4px',
          boxShadow: '0 0 12px rgba(56, 189, 248, 0.15)',
          hoverBackground: '#334155',
          fontFamily: '"Geist", "Inter", sans-serif',
          padding: '10px 18px',
          fontWeight: '500'
        }
      },
      editorial: {
        visualTheme: 'Literary monochrome, sharp typographic baseline, zero ornamentation',
        tokens: {
          background: '#18181b',
          color: '#fcfbf9',
          border: '1px solid #18181b',
          borderRadius: '0px',
          boxShadow: 'none',
          hoverBackground: '#27272a',
          fontFamily: '"Newsreader", "Playfair Display", Georgia, serif',
          padding: '12px 24px',
          fontWeight: '400'
        }
      },
      neo_brutalist: {
        visualTheme: 'High-contrast black outline, vibrant saturation, hard drop shadow',
        tokens: {
          background: '#facc15',
          color: '#000000',
          border: '3px solid #000000',
          borderRadius: '0px',
          boxShadow: '4px 4px 0px #000000',
          hoverBackground: '#fde047',
          activeTransform: 'translate(2px, 2px)',
          activeShadow: '2px 2px 0px #000000',
          fontFamily: '"Space Grotesk", sans-serif',
          padding: '12px 20px',
          fontWeight: '700'
        }
      }
    },
    provenance: {
      source: 'zenitch_design_intelligence_core',
      license: 'MIT',
      author: 'Zenitch Core Team',
      version: '1.0.0',
      verified: true
    }
  },

  input: {
    componentId: 'input',
    name: 'FormInput',
    category: 'ui_primitive',
    structure: {
      semanticElement: '<div class="form-field"><label for="{id}">Label</label><input id="{id}" .../><span id="{errorId}" role="alert">Error</span></div>',
      slots: {
        label: 'Mandatory accessible label bound via htmlFor / id',
        leadingAddon: 'Optional prefix icon, currency indicator, or protocol string',
        inputElement: 'Native or controlled input element capturing user data',
        trailingAction: 'Optional suffix icon, clear button, or password visibility toggle',
        helperText: 'Optional contextual hint bound via aria-describedby',
        errorMessage: 'Validation error text bound via aria-describedby or aria-errormessage with role="alert"'
      },
      containerHierarchy: '<div class="form-field"><label for="{id}"></label><div class="input-control"><span class="leading"></span><input id="{id}" /><span class="trailing"></span></div><p id="{errorId}" role="alert"></p></div>'
    },
    accessibility: {
      role: 'textbox',
      requiredAttributes: [
        'id (unique identifier matching label for attribute)',
        'aria-invalid="true" (mandatory when validation fails)',
        'aria-describedby="{errorId|helperId}" (links feedback text to input)',
        'aria-required="true" (when field completion is mandatory)',
        'autocomplete (appropriate standard autocomplete token)'
      ],
      keyboardInteractions: [
        'Tab: moves focus to input in sequence',
        'Standard text cursor navigation: Left/Right Arrow, Home, End, Backspace, Delete',
        'Enter: triggers form submission when within a valid form container'
      ],
      focusManagement: 'Focus ring must provide minimum 3:1 contrast against both the input surface and surrounding background. Clicking the associated label must focus the input.',
      touchTarget: {
        minWidth: '100%',
        minHeight: '44px',
        standard: 'WCAG 2.1 SC 2.5.5'
      }
    },
    interactionStates: {
      supportedStates: ['idle', 'hover', 'focus_visible', 'disabled', 'readonly', 'error', 'success'],
      stateInvariants: {
        idle: 'Resting state with clear border distinguishing input boundary.',
        hover: 'Subtle border contrast increase signaling interactive readiness.',
        focus_visible: 'Unambiguous focus ring without layout shift; placeholder text remains legible or transforms to floating label.',
        disabled: 'disabled attribute present; background muted; opacity <= 0.6; cursor: not-allowed; text not editable.',
        readonly: 'readOnly attribute present; focusable for screen readers but content immutable; normal opacity.',
        error: 'aria-invalid="true"; border shifts to semantic destructive token; error message exposed with role="alert".',
        success: 'Subtle confirmation border or trailing checkmark icon for validated inputs.'
      }
    },
    responsive: {
      mobile: 'Font-size must be >= 16px to prevent automatic viewport zoom on iOS Safari; 100% container width.',
      desktop: 'Bounded width inside structured grid columns (typically 320px to 480px for standalone fields).',
      overflow: 'Horizontal scrolling enabled internally when input text length exceeds field width.'
    },
    styleAdaptations: {
      minimal_saas: {
        visualTheme: 'Subtle slate border, crisp white surface, calm indigo focus ring',
        tokens: {
          background: '#ffffff',
          color: '#0f172a',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          focusRing: '0 0 0 3px rgba(37, 99, 235, 0.15)',
          fontFamily: 'Inter, system-ui, sans-serif',
          padding: '10px 14px',
          placeholderColor: '#94a3b8'
        }
      },
      dark_modern: {
        visualTheme: 'Deep slate background, crisp dark border, glowing cyan focus ring',
        tokens: {
          background: '#0f172a',
          color: '#f8fafc',
          border: '1px solid #1e293b',
          borderRadius: '4px',
          focusRing: '0 0 0 2px #38bdf8',
          fontFamily: '"Geist", "Inter", sans-serif',
          padding: '10px 14px',
          placeholderColor: '#64748b'
        }
      },
      editorial: {
        visualTheme: 'Sharp hairline divider, warm cream surface, serif label, no shadow',
        tokens: {
          background: '#fcfbf9',
          color: '#1c1917',
          border: '1px solid #d6d3d1',
          borderRadius: '0px',
          focusRing: '0 0 0 1px #18181b',
          fontFamily: '"Newsreader", Georgia, serif',
          padding: '12px 14px',
          placeholderColor: '#a8a29e'
        }
      },
      neo_brutalist: {
        visualTheme: '3px solid black border, 0px radius, sharp drop shadow, monospace/grotesk label',
        tokens: {
          background: '#ffffff',
          color: '#000000',
          border: '3px solid #000000',
          borderRadius: '0px',
          boxShadow: '3px 3px 0px #000000',
          focusRing: 'none',
          fontFamily: '"Space Grotesk", sans-serif',
          padding: '12px 14px',
          placeholderColor: '#52525b'
        }
      }
    },
    provenance: {
      source: 'zenitch_design_intelligence_core',
      license: 'MIT',
      author: 'Zenitch Core Team',
      version: '1.0.0',
      verified: true
    }
  },

  dialog: {
    componentId: 'dialog',
    name: 'Dialog',
    category: 'composite',
    structure: {
      semanticElement: '<dialog open> or <div role="dialog" aria-modal="true" aria-labelledby="{titleId}">',
      slots: {
        backdrop: 'Purely decorative semi-transparent backdrop overlay. MUST be a sibling to the dialog container and marked aria-hidden="true". MUST NEVER enclose or wrap the active dialog container.',
        header: 'Container for accessible heading and dismiss controls',
        title: 'Accessible dialog heading referenced by aria-labelledby (or aria-label on dialog container)',
        description: 'Optional dialog purpose description referenced by aria-describedby',
        body: 'Main dialog content, interactive form, or message text',
        closeButton: 'Accessible dismiss button with aria-label="Close dialog"',
        footerActions: 'Action group containing Cancel and Confirm buttons'
      },
      containerHierarchy: '<!-- Decorative backdrop sibling (never wrap dialog inside aria-hidden) -->\n<div class="dialog-backdrop" aria-hidden="true"></div>\n<!-- Active dialog container (separate from backdrop) -->\n<div role="dialog" aria-modal="true" aria-labelledby="{titleId}" class="dialog-container">\n  <header class="dialog-header">\n    <h2 id="{titleId}">Dialog Title</h2>\n    <button type="button" aria-label="Close dialog"></button>\n  </header>\n  <div class="dialog-body"></div>\n  <footer class="dialog-footer"></footer>\n</div>'
    },
    accessibility: {
      role: 'dialog',
      requiredAttributes: [
        'aria-modal="true" (mandatory for modal dialogs to signal screen readers)',
        'aria-labelledby="{titleId}" (references visible heading element)',
        'aria-describedby="{descId}" (optional reference to explanation text)'
      ],
      keyboardInteractions: [
        'Escape: dismisses dialog and returns focus to trigger element',
        'Tab: moves focus to next focusable element inside dialog; wraps from last to first (focus trap)',
        'Shift+Tab: moves focus to previous focusable element inside dialog; wraps from first to last'
      ],
      focusManagement: 'Runtime Requirements (to be implemented by component controller): (1) Active dialog MUST NOT be placed inside an ancestor with aria-hidden="true". (2) Initial focus moves to first interactive control inside dialog or dialog container. (3) Focus trap must keep Tab/Shift+Tab navigation within the dialog. (4) Escape key must dismiss the dialog and return focus to the opening trigger. (5) Background content outside dialog must be marked inert or aria-hidden="true" while modal is active.',
      touchTarget: {
        minWidth: '44px',
        minHeight: '44px',
        standard: 'WCAG 2.1 SC 2.5.5 for close and action buttons'
      }
    },
    interactionStates: {
      supportedStates: ['idle', 'opening', 'open', 'closing', 'closed'],
      stateInvariants: {
        opening: 'Entrance transition <= 200ms with subtle scale/fade; body scroll locked.',
        open: 'Background page marked inert or aria-hidden; focus trap active; body overflow: hidden.',
        closing: 'Exit transition <= 150ms; focus returned cleanly before node unmounting.',
        closed: 'Dialog removed from accessibility tree; focus safely back on opener.'
      }
    },
    responsive: {
      mobile: 'Transforms into bottom-sheet drawer or full-screen card on viewports <640px; 100vw width, zero radius on bottom edges.',
      desktop: 'Centered modal with maximum width bounded between 480px and 640px; margin auto.',
      overflow: 'Dialog body max-height capped (e.g. max-h-[80vh]) with vertical auto-scroll for overflowing content.'
    },
    styleAdaptations: {
      minimal_saas: {
        visualTheme: 'Subtle backdrop blur, soft elevated shadow, rounded corners',
        tokens: {
          backdropBackground: 'rgba(15, 23, 42, 0.45)',
          background: '#ffffff',
          color: '#0f172a',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          fontFamily: 'Inter, system-ui, sans-serif',
          maxWidth: '540px'
        }
      },
      dark_modern: {
        visualTheme: 'Deep dark glass surface, thin zinc border, glowing cyan aura',
        tokens: {
          backdropBackground: 'rgba(0, 0, 0, 0.75)',
          background: '#0f172a',
          color: '#f8fafc',
          border: '1px solid #334155',
          borderRadius: '6px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 20px rgba(56, 189, 248, 0.1)',
          fontFamily: '"Geist", "Inter", sans-serif',
          maxWidth: '540px'
        }
      },
      editorial: {
        visualTheme: 'Warm paper surface, hairline border, serif typography, literary elevation',
        tokens: {
          backdropBackground: 'rgba(24, 24, 27, 0.5)',
          background: '#fcfbf9',
          color: '#1c1917',
          border: '1px solid #18181b',
          borderRadius: '0px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          fontFamily: '"Newsreader", Georgia, serif',
          maxWidth: '560px'
        }
      },
      neo_brutalist: {
        visualTheme: 'Pure white card, 3px solid black border, 8px hard offset black shadow',
        tokens: {
          backdropBackground: 'rgba(0, 0, 0, 0.5)',
          background: '#ffffff',
          color: '#000000',
          border: '3px solid #000000',
          borderRadius: '0px',
          boxShadow: '8px 8px 0px #000000',
          fontFamily: '"Space Grotesk", sans-serif',
          maxWidth: '520px'
        }
      }
    },
    provenance: {
      source: 'zenitch_design_intelligence_core',
      license: 'MIT',
      author: 'Zenitch Core Team',
      version: '1.0.0',
      verified: true
    }
  },

  tabs: {
    componentId: 'tabs',
    name: 'Tabs',
    category: 'composite',
    structure: {
      semanticElement: '<div class="tabs-container">',
      slots: {
        tablist: 'Container for tab buttons declaring role="tablist" with accessible label',
        tab: 'Interactive tab trigger declaring role="tab", aria-selected, aria-controls, and id',
        tabpanel: 'Associated content container declaring role="tabpanel", matching id, and aria-labelledby pointing to tab'
      },
      containerHierarchy: '<div class="tabs-container"><div role="tablist" aria-label="{label}"><button role="tab" id="tab-{id}" aria-controls="panel-{id}" aria-selected="true">{title}</button></div><div role="tabpanel" id="panel-{id}" aria-labelledby="tab-{id}" tabindex="0">{content}</div></div>'
    },
    accessibility: {
      role: 'tablist',
      requiredAttributes: [
        'role="tablist" (mandatory container for tab triggers)',
        'aria-label or aria-labelledby (mandatory accessible name on tablist)',
        'role="tab" (mandatory on each tab trigger element)',
        'aria-selected="true|false" (mandatory selection state on each tab)',
        'aria-controls="[panelId]" (mandatory reference to associated tabpanel id)',
        'role="tabpanel" (mandatory on each content panel container)',
        'aria-labelledby="[tabId]" (mandatory reference back to controlling tab)',
        'tabindex="0" (on tabpanel to ensure accessibility for keyboard users)'
      ],
      keyboardInteractions: [
        'ArrowLeft / ArrowRight: cycles focus across tabs within horizontal tablist',
        'Home / End: moves focus directly to first / last tab',
        'Enter / Space: activates the currently focused tab trigger',
        'Tab: moves focus from the active tab into the active tabpanel'
      ],
      focusManagement: 'Active tab must have tabindex="0"; inactive tabs must have tabindex="-1" (roving tabindex pattern). High-contrast focus ring with >=2px offset on :focus-visible.',
      touchTarget: {
        minWidth: '44px',
        minHeight: '44px',
        standard: 'WCAG 2.1 SC 2.5.5 (Target Size) & SC 2.5.8 (Target Size Minimum)'
      }
    },
    interactionStates: {
      supportedStates: ['default', 'hover', 'active_selected', 'focus-visible', 'disabled'],
      stateInvariants: {
        selected: 'Exactly one tab in a tablist must have aria-selected="true" at any given time',
        visibility: 'The active tabpanel must be visible; inactive tabpanels must be hidden or omitted from rendering',
        disabled: 'Disabled tabs must declare aria-disabled="true" or disabled and be skipped in keyboard navigation'
      }
    },
    responsive: {
      mobile: 'Horizontal scroll with scroll-snap-type: x mandatory, or compact segmented dropdown navigation',
      desktop: 'Inline horizontal flex tabstrip with animated or solid active indicator line',
      overflow: 'overflow-x: auto with scrollbar-width: none on mobile viewport; touch inertia scrolling enabled'
    },
    styleAdaptations: {
      minimal_saas: {
        visualTheme: 'Clean SaaS tabs with subtle bottom border line, slate-900 active label, and slate-500 inactive labels',
        tokens: {
          borderBottom: '2px solid transparent',
          activeBorderColor: '#0f172a',
          activeColor: '#0f172a',
          inactiveColor: '#64748b',
          gap: '1rem',
          fontSize: '0.875rem'
        }
      },
      dark_modern: {
        visualTheme: 'Obsidian tabstrip with electric cyan active indicator and elevated card surface',
        tokens: {
          activeBorderColor: '#38bdf8',
          activeColor: '#f8fafc',
          inactiveColor: '#94a3b8',
          background: '#111827',
          gap: '1.25rem',
          fontSize: '0.875rem'
        }
      },
      editorial: {
        visualTheme: 'Literary serif tab titles with warm ink palette and delicate bottom hairline',
        tokens: {
          fontFamily: 'serif',
          activeBorderColor: '#7c2d12',
          activeColor: '#1c1917',
          inactiveColor: '#78716c',
          gap: '1.5rem',
          fontSize: '1rem'
        }
      },
      neo_brutalist: {
        visualTheme: 'High-contrast bold bordered tab tabs with solid black active background and sharp corners',
        tokens: {
          border: '2px solid #000',
          activeBackground: '#000',
          activeColor: '#fff',
          inactiveBackground: '#fff',
          inactiveColor: '#000',
          gap: '0.5rem',
          borderRadius: '0px'
        }
      }
    },
    provenance: {
      source: 'Zenitch Core Design Intelligence',
      license: 'MIT / Sovereign Internal',
      author: 'Zenitch Architecture Team',
      version: '1.0.0',
      verified: true
    }
  },
  table: {
    componentId: 'table',
    name: 'DataTable',
    category: 'composite',
    structure: {
      semanticElement: '<table class="data-table"><thead><tr><th scope="col">...</th></tr></thead><tbody><tr><td>...</td></tr></tbody></table>',
      slots: {
        caption: 'Optional accessible table summary or descriptive caption',
        headerRow: 'Header cells (<th scope="col">) with sorting and selection indicators',
        bodyRows: 'Data rows (<tr role="row">) containing data cells (<td>)',
        emptyState: 'Structured placeholder rendered when data array is empty',
        loadingSkeleton: 'Accessible skeleton placeholder rows with aria-busy="true"',
        paginationFooter: 'Pagination, page size selector, and record count controls'
      },
      containerHierarchy: '<div class="table-container" role="region" aria-label="{caption}" tabindex="0"><table class="data-table"><caption></caption><thead><tr><th scope="col" aria-sort="..."></th></tr></thead><tbody><tr><td></td></tr></tbody><tfoot><tr><td colspan="..."></td></tr></tfoot></table></div>'
    },
    accessibility: {
      role: 'table',
      requiredAttributes: [
        '<th scope="col"> (mandatory for all column headers)',
        '<th scope="row"> (mandatory for row header identifiers if applicable)',
        'aria-sort="ascending|descending|none" (mandatory on sortable column headers)',
        'caption or aria-label on scrollable wrapper region'
      ],
      keyboardInteractions: [
        'Tab: moves focus into table region and through sortable headers/interactive controls',
        'Enter / Space: activates sort on focused column header',
        'Arrow keys (when using role="grid"): navigates cells in 2D coordinate space'
      ],
      focusManagement: 'Visible focus ring on sortable headers and cell action buttons. Scrollable container wrapper is focusable (tabindex="0") to allow keyboard scrolling.',
      touchTarget: {
        minWidth: '44px',
        minHeight: '44px',
        standard: 'WCAG 2.1 SC 2.5.5 for interactive sort headers and action buttons'
      }
    },
    interactionStates: {
      supportedStates: ['idle', 'sorting', 'loading', 'empty', 'row_hover', 'row_selected'],
      stateInvariants: {
        idle: 'Static tabular rendering with clean alignment (numbers right-aligned, text left-aligned).',
        sorting: 'Sort trigger updates aria-sort attribute; sort direction indicator visible.',
        loading: 'Table body renders skeleton rows; aria-busy="true" set on table or container.',
        empty: 'Full-width cell (colspan="100%") renders empty state illustration and actionable retry/create button.',
        row_hover: 'Hovered row background highlights subtly to assist horizontal visual tracking.',
        row_selected: 'Selected row background tinted with primary brand tone; checkbox checked.'
      }
    },
    responsive: {
      mobile: 'Wrapped in overflow-x: auto container with sticky first column or transformed into stacked card items on mobile.',
      desktop: 'Full-width tabular grid with proportional column widths and optional sticky header.',
      overflow: 'Scrollable container must have tabindex="0" and aria-label to support keyboard scrolling.'
    },
    styleAdaptations: {
      minimal_saas: {
        visualTheme: 'Subtle gray header background, clean borders, gentle row hover',
        tokens: {
          headerBackground: '#f8fafc',
          headerColor: '#475569',
          borderColor: '#e2e8f0',
          rowHoverBackground: '#f1f5f9',
          fontFamily: 'Inter, system-ui, sans-serif',
          cellPadding: '12px 16px',
          borderCollapse: 'collapse'
        }
      },
      dark_modern: {
        visualTheme: 'Deep slate background, subtle row dividers, glowing row hover',
        tokens: {
          headerBackground: '#090d16',
          headerColor: '#94a3b8',
          borderColor: '#1e293b',
          rowHoverBackground: '#1e293b',
          fontFamily: '"Geist", "Inter", sans-serif',
          cellPadding: '12px 16px',
          borderCollapse: 'collapse'
        }
      },
      editorial: {
        visualTheme: 'Monochrome tabular alignment, horizontal rule dividers, serif headings',
        tokens: {
          headerBackground: '#ffffff',
          headerColor: '#18181b',
          borderColor: '#e4e4e7',
          rowHoverBackground: '#fafafa',
          fontFamily: '"Newsreader", Georgia, serif',
          cellPadding: '14px 16px',
          borderCollapse: 'collapse'
        }
      },
      neo_brutalist: {
        visualTheme: 'Heavy 2px black cell borders, bold yellow header row, high-contrast hover',
        tokens: {
          headerBackground: '#facc15',
          headerColor: '#000000',
          borderColor: '#000000',
          rowHoverBackground: '#fef08a',
          fontFamily: '"Space Grotesk", sans-serif',
          cellPadding: '12px 16px',
          borderCollapse: 'collapse',
          borderWidth: '2px solid #000000'
        }
      }
    },
    provenance: {
      source: 'zenitch_design_intelligence_core',
      license: 'MIT',
      author: 'Zenitch Core Team',
      version: '1.0.0',
      verified: true
    }
  }
};

/**
 * Fast, deterministic component contract resolver.
 * Retrieves only the requested component contract in O(1) time with zero disk I/O.
 */
export function getComponentContract(requestedTerm: string): ComponentContract | undefined {
  const normalized = requestedTerm.toLowerCase().trim();

  // Button mapping
  if (
    normalized.includes('button') ||
    normalized.includes('btn') ||
    normalized.includes('cta') ||
    normalized.includes('submit') ||
    normalized.includes('action')
  ) {
    return COMPONENT_CONTRACTS.button;
  }

  // Form input mapping
  if (
    normalized.includes('input') ||
    normalized.includes('form') ||
    normalized.includes('textfield') ||
    normalized.includes('text field') ||
    normalized.includes('textbox') ||
    normalized.includes('searchbox')
  ) {
    return COMPONENT_CONTRACTS.input;
  }

  // Dialog / Modal mapping
  if (
    normalized.includes('dialog') ||
    normalized.includes('modal') ||
    normalized.includes('popup') ||
    normalized.includes('alertdialog') ||
    normalized.includes('prompt') ||
    normalized.includes('drawer')
  ) {
    return COMPONENT_CONTRACTS.dialog;
  }

  // Data table mapping
  if (
    normalized.includes('table') ||
    normalized.includes('datatable') ||
    normalized.includes('grid') ||
    normalized.includes('data grid') ||
    normalized.includes('matrix')
  ) {
    return COMPONENT_CONTRACTS.table;
  }

  return undefined;
}
