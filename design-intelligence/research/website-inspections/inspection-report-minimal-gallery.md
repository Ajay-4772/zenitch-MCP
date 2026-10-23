# Empirical Website Inspection Report: Minimal Gallery

- **Target URL**: https://minimal.gallery/
- **Date Inspected**: 2026-10-02
- **Access Status**: SUCCESSFUL (Live DOM Verified)
- **Primary Domain**: Hand-picked minimalist, Swiss, and modern editorial web design directory.

---

## 1. Observed Design Architecture

### Layout & Spacing
- **Whitespace Discipline**: Extreme generous whitespace. Minimal Gallery uses an airy canvas that lets typography and high-resolution design screenshots breathe without clutter.
- **Header Alignment**: Tri-part header structure:
  - Left: Primary categories (`Websites`, `Templates`, `Tools`)
  - Center: Minimal brand wordmark (`Minimal Gallery`)
  - Right: Search trigger button and theme toggle

### Typography & Font Engineering
- **Primary Typeface**: `Inter` v5.3.0 loaded via preloaded WOFF2 (`as="font" type="font/woff2" crossorigin`).
- **Font Rendering**: Crisp anti-aliasing with strict tracking adjustments for small uppercase tags and subtle lowercase navigation labels.

### Theme & Local Storage State
- **Instant Dark/Light Hydration**: Inline synchronous script executing in `<head>` to prevent Flash of Unstyled Content (FOUC):
  ```javascript
  !function(){try{const t=localStorage.getItem("mg_theme");"light"===t&&document.documentElement.classList.add(t)}catch(t){}}();
  ```
- **Meta Color Harmony**: `meta[name="theme-color"]` set to `#000000` matching the deep contrast aesthetic.

---

## 2. Reusable Patterns
1. **FOUC-Proof Theme Toggle**: Inline pre-render check to read `localStorage` before the body renders.
2. **Editorial Card Layout**: Flat, unobtrusive card frames where website screenshots are framed by subtle hairline borders (`#1a1a1a` on dark mode, `#eaeaea` on light mode).
3. **Restrained Micro-interactions**: Minimalist hover scale (1.01x to 1.02x) with cubic-bezier easing `cubic-bezier(0.16, 1, 0.3, 1)`.
