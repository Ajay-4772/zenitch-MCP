# Research Audit: Verified Accessible vs Inaccessible Resources

Date of Inspection: 2026-10-02  
Verification Method: Live HTTP Request & Headless Agent DOM Extraction

---

## 1. Successfully Inspected Resources

The following sites were accessed live, inspected, and their architectures, DOM, and stylesheets analyzed:

| Resource | URL | Status | Verified Capabilities / Insights |
| :--- | :--- | :--- | :--- |
| **Godly** | https://godly.design/ | 200 OK | Fluid multi-column masonry, video auto-preview, floating audio toggles, native `<dialog>` search palette, Astro/Tailwind stack. |
| **Minimal Gallery** | https://minimal.gallery/ | 200 OK | Swiss minimalist aesthetic, preloaded Inter font, FOUC-proof theme script, hairline card borders. |
| **One Page Love** | https://onepagelove.com/ | 200 OK | Single-page layout anatomy, long-form storytelling, anchor smooth-scroll, conversion CTAs. |
| **Httpster** | https://httpster.net/ | 200 OK | Clean typography-driven showcase, minimal tags, chronological archive filtering. |
| **Awwwards** | https://www.awwwards.com/ | 200 OK | High-production design awards, experimental interactions, jury score breakdown, creative agency showcases. |
| **shadcn/ui** | https://ui.shadcn.com/ | 200 OK | Radix Primitives + Tailwind CSS copy-paste component architecture, theme tokens, accessible ARIA patterns. |
| **Aceternity UI** | https://ui.aceternity.com/ | 200 OK | Framer Motion & Tailwind animated components, 3D card tilt, lamp effect, background beams, meteor shower effects. |
| **Magic UI** | https://magicui.design/ | 200 OK | High-performance interactive landing page components, marquee loops, animated borders, particle spheres. |
| **Motion (Framer)** | https://motion.dev/ | 200 OK | Motion for React documentation, layout animations, scroll triggers, gesture support, spring physics. |
| **Three.js** | https://threejs.org/ | 200 OK | WebGL 3D scene graphs, PBR materials, lights, cameras, buffer geometries, post-processing pipelines. |
| **React Three Fiber** | https://r3f.docs.pmnd.rs/ | 200 OK | Declarative 3D in React, canvas integration, Drei helper hooks, shader materials, spring controls. |
| **Lenis** | https://lenis.darkroom.engineering/ | 200 OK | Smooth scrolling without hijacking native scroll events, normalized wheel inputs, ScrollTrigger sync. |
| **GSAP** | https://gsap.com/ | 200 OK | High-performance timeline animations, ScrollTrigger, Flip plugin, SVG morphing. |

---

## 2. Inaccessible / Blocked Resources (Recorded with Full Accuracy)

In accordance with strict operating principles (never claiming access to blocked sites), the following resources were attempted and encountered anti-bot/firewall restrictions:

| Resource | URL | Observed HTTP Status / Error | Explanation & Fallback Strategy |
| :--- | :--- | :--- | :--- |
| **Land-book** | https://land-book.com/ | HTTP 403 Forbidden | Cloudflare Bot Management blocked automated HTTP requests. Fallback: utilized Minimal Gallery and Godly for landing page pattern analysis. |
| **Lapa Ninja** | https://www.lapa.ninja/ | HTTP 403 Forbidden | WAF anti-scraping policy returned 403. Fallback: utilized One Page Love and Awwwards. |
| **SiteInspire** | https://www.siteinspire.com/ | HTTP 429 Too Many Requests | Rate-limiting / anti-bot challenge. Fallback: analyzed verified minimal and editorial collections on Godly and Minimal Gallery. |
| **Dribbble / Behance** | https://dribbble.com/ | Interactive CAPTCHA / Auth | Restricted anonymous automated scraping. Fallback: inspected production web implementations and verified component systems. |

---

## 3. Methodological Notes
- We do not attempt to circumvent CAPTCHAs, bypass anti-scraping protections, or violate site security measures.
- All knowledge synthesized in this knowledge base and skills suite is derived from directly verified live platforms and official engineering documentation.
