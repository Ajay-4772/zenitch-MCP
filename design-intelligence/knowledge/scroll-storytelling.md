# Master Knowledge: Cinematic Scroll-Driven Storytelling & Product Morphing

---

## 1. The Anatomy of Scroll-Driven Storytelling

Cinematic web storytelling transforms passive reading into an interactive narrative journey. The scrollbar becomes the user's timeline scrubber, advancing visual scenes, camera angles, exploded product components, and typography in direct sync with physical finger movement.

---

## 2. Technical Architecture: Pinned Canvas Scrubbing

To achieve flawless 60–120 FPS performance during scroll storytelling, never animate heavy layout properties. Keep the WebGL/Canvas viewport pinned fixed on screen while a tall virtual container provides scroll height.

```
┌────────────────────────────────────────────────────────┐
│ Pinned Viewport Container (100vh, position: sticky)    │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 3D WebGL Canvas (Interpolates 0.0 -> 1.0)        │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Narrative Typography Overlay (Fades In / Out)    │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
▲ Virtual Scroll Track Height: 400vh to 600vh
```

### GSAP ScrollTrigger Implementation Pattern
```javascript
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function initProductStory(bottleMesh, flowerMesh, particleSystem) {
  const storyTimeline = gsap.timeline({
    scrollTrigger: {
      trigger: '#story-track',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1.0, // 1-second buttery smooth scrub smoothing
      pin: true,
      anticipatePin: 1
    }
  });

  // Scene 1 -> 2: Bottle Explosion & Cap Elevation
  storyTimeline
    .to(bottleMesh.cap.position, { y: 1.8, ease: 'power2.out', duration: 1 }, 0)
    .to(bottleMesh.base.position, { y: -0.8, ease: 'power2.out', duration: 1 }, 0)
    
    // Scene 2 -> 3: Flower Bud Bloom & Scale Expansion
    .fromTo(flowerMesh.scale, 
      { x: 0.1, y: 0.1, z: 0.1 }, 
      { x: 1.4, y: 1.4, z: 1.4, ease: 'back.out(1.5)', duration: 1.5 }, 0.8)
    .to(flowerMesh.rotation, { y: Math.PI * 1.5, duration: 2 }, 0.8)
    
    // Scene 3 -> 4: Golden Particle Burst & Mist Aura
    .to(particleSystem.material, { opacity: 0.9, duration: 0.5 }, 1.8)
    .to(particleSystem.rotation, { y: Math.PI * 2, duration: 2 }, 1.8)
    
    // Scene 4 -> 5: Reassembly into Sealed Luxury Product
    .to(bottleMesh.cap.position, { y: 0.5, ease: 'power3.inOut', duration: 1.2 }, 3.2)
    .to(bottleMesh.base.position, { y: 0, ease: 'power3.inOut', duration: 1.2 }, 3.2)
    .to(flowerMesh.scale, { x: 0, y: 0, z: 0, duration: 0.8 }, 3.4);
}
```

---

## 3. Exploded View & Metamorphic Assembly Principles

1. **Hierarchy of Disassembly**:
   - Primary shell separates first (cap, outer glass sleeve).
   - Core functional heart emerges second (atomizer, floral heart, botanical essence).
   - Atmospheric aura erupts third (particles, mist, caustics).
2. **Organic vs. Mechanical Contrast**:
   - Glass and metals translate along rigid Cartesian axes (straight vertical Y separation, sharp 90-degree reflections).
   - Botanical and fragrance elements unfold with organic non-linear curves (Euler petal rotation, turbulent noise displacement).
3. **Audio-Visual Resonance**:
   - Pair subtle sub-bass ambient hums with the bottle explosion, followed by high-frequency crystalline chimes when golden particles disperse.
