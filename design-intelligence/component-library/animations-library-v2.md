# Master Reusable Animation Library (Zenitch v2)

Modular, production-grade animation patterns for high-end digital experiences. All components strictly honor `prefers-reduced-motion`.

---

## 1. FloatingObject (3D & 2D Organic Levitation)
- **Visual Goal**: Creates gentle, weightless floating behavior for luxury product bottles, gemstones, and floral petals.
```typescript
export const floatingVariants = {
  initial: { y: 0, rotateZ: 0 },
  animate: {
    y: [-8, 8, -8],
    rotateZ: [-1.5, 1.5, -1.5],
    transition: {
      duration: 6,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
};
```

---

## 2. ExplodedProduct & Assembly State Machine
- **Visual Goal**: Orchestrates the multi-part mechanical disassembly and convergence of a 3D product.
```typescript
export interface ExplodedProductConfig {
  capOffset: number; // e.g. +1.8 in Three.js world units
  collarOffset: number; // e.g. +0.8
  baseOffset: number; // e.g. -0.6
  bloomScale: number; // e.g. 1.5
  progress: number; // 0.0 (assembled) -> 1.0 (fully exploded)
}

export function interpolateExplodedState(parts, progress) {
  // Interpolates individual mesh positions based on scrub progress
  parts.cap.position.y = THREE.MathUtils.lerp(0.8, 2.4, progress);
  parts.collar.position.y = THREE.MathUtils.lerp(0.4, 1.2, progress);
  parts.flowerCore.scale.setScalar(THREE.MathUtils.lerp(0.01, 1.5, Math.min(progress * 1.5, 1.0)));
  parts.base.position.y = THREE.MathUtils.lerp(0.0, -0.6, progress);
}
```

---

## 3. ParticleField (Swirling Golden Essence)
- **Visual Goal**: Emits golden radiant sparkles that spiral around the blooming floral core.
```javascript
export function createParticleVortex(count = 300) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.5 + Math.random() * 2.5;
    const y = (Math.random() - 0.5) * 3.0;

    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
    scales[i] = Math.random() * 0.04 + 0.01;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  const material = new THREE.PointsMaterial({
    color: 0xd4af37, // Rich Antique Gold
    size: 0.05,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending
  });

  return new THREE.Points(geometry, material);
}
```

---

## 4. MagneticButton (Tactile Luxury Trigger)
- **Visual Goal**: Magnetic cursor attraction within 60px bounding radius.
```javascript
export function attachMagneticEffect(buttonElement, strength = 0.35) {
  buttonElement.addEventListener('mousemove', (e) => {
    const rect = buttonElement.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) * strength;
    const y = (e.clientY - rect.top - rect.height / 2) * strength;
    buttonElement.style.transform = `translate(${x}px, ${y}px)`;
  });

  buttonElement.addEventListener('mouseleave', () => {
    buttonElement.style.transform = 'translate(0px, 0px)';
  });
}
```
