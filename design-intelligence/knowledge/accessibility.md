# Master Knowledge: Accessibility (a11y) & WCAG 2.2 Standards

---

## 1. Accessibility as an Architectural Foundation

Accessibility is not an afterthought or compliance checklist; it is the hallmark of professional engineering. A website that fails accessibility fails production readiness.

---

## 2. WCAG 2.2 Key Requirements

### A. Color Contrast Ratios
- **Normal Text (< 18pt or < 14pt bold)**: Minimum 4.5:1 (AA), 7.0:1 (AAA).
- **Large Text (>= 18pt or >= 14pt bold)**: Minimum 3.0:1 (AA), 4.5:1 (AAA).
- **UI Components & Graphical Objects**: Minimum 3.0:1 against adjacent backgrounds (borders, active states, icons).

### B. Focus Management & Keyboard Navigation
- **Visible Focus Indicator (WCAG 2.4.7 / 2.4.11 / 2.4.12)**:
  - Never set `outline: none` without providing an enhanced `:focus-visible` replacement.
  - Recommended CSS rule:
    ```css
    :focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 3px;
      border-radius: inherit;
    }
    ```
- **Skip Links**: Always provide a `<a href="#main-content" class="sr-only focus:not-sr-only">Skip to content</a>` at the top of the DOM.
- **Keyboard Traps**: Ensure dialogs and modals trap Tab navigation internally, and restore focus to the triggering element upon dismissal with `Escape`.

### C. Touch Target Sizes (WCAG 2.5.8 Pointer Target Minimum)
- All interactive targets must provide a minimum bounding box of 24x24 CSS pixels, and ideally 44x44 CSS pixels for primary actions on touch viewports.

---

## 3. Screen Reader Optimization & Semantic HTML

- **Headings**: Strictly maintain a single `<h1>` per page, followed by logical `<h2>`, `<h3>` trees. Never skip levels for styling purposes.
- **Interactive Semantics**: Use native `<button>` for actions and `<a>` for navigation. Avoid `<div onClick>` which lacks keyboard focusability and ARIA role assignment.
- **Labels & Forms**: Every `<input>` must have an associated `<label for="...">` or `aria-label`.
- **Live Regions**: Dynamic updates (cart total changes, live toast messages) must utilize `aria-live="polite"` or `role="status"` to announce changes without interrupting active speech.
