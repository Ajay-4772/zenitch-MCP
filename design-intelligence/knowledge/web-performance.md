# Master Knowledge: Web Performance Engineering & Core Web Vitals

---

## 1. Core Web Vitals Benchmarks

Every creative experience must satisfy Google’s 75th percentile Core Web Vitals thresholds:

1. **LCP (Largest Contentful Paint)**: `<= 2.5 seconds`
   - *Driver*: Hero image, display headline, or background video element.
   - *Remedies*: Preload hero fonts (`<link rel="preload">`), use modern image formats (`.webp`, `.avif`), use responsive `srcset`, inline critical CSS, avoid client-side rendering bottlenecks for initial text.
2. **INP (Interaction to Next Paint)**: `<= 200 milliseconds`
   - *Driver*: Main thread blocking during user clicks, keystrokes, and taps.
   - *Remedies*: Defer non-critical JavaScript, break long tasks via `scheduler.yield()` or `setTimeout(..., 0)`, use lightweight event listeners, offload heavy calculations to Web Workers.
3. **CLS (Cumulative Layout Shift)**: `<= 0.1`
   - *Driver*: Unsized images, dynamic banner injections, late-hydrated web fonts.
   - *Remedies*: Explicit `width` and `height` (or CSS `aspect-ratio`) on all images, video, and iframes; use `font-display: swap` paired with fallback font size-adjust metric overrides (`@font-face { size-adjust: ... }`).

---

## 2. Asset & Script Optimization Strategies

### Modern Image Loading Matrix
```html
<!-- Priority Hero Image (Preloaded, High Priority, No Lazy Loading) -->
<link rel="preload" as="image" href="/hero.webp" type="image/webp" fetchpriority="high">
<img src="/hero.webp" alt="Creative showcase" fetchpriority="high" width="1920" height="1080" class="w-full h-auto">

<!-- Below-The-Fold Assets (Native Lazy, Async Decoding) -->
<img src="/feature.webp" alt="Feature screenshot" loading="lazy" decoding="async" width="800" height="600" class="w-full h-auto">
```

### Font Optimization
- Convert all fonts to `.woff2` (typically 30-50% smaller than standard `.woff` or `.ttf`).
- Self-host fonts to eliminate third-party cross-origin network latency.
- Subset glyphs to required languages (e.g., Latin subset).
