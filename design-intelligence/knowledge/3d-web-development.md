# Master Knowledge: Professional 3D Web Development & Immersive Experiences

---

## 1. 3D Web Rendering Spectrum

When architecting a 3D web experience, choose the lowest-overhead technology that satisfies the artistic vision:

1. **CSS 3D Transforms (`perspective`, `rotateX/Y`, `preserve-3d`)**:
   - *Best For*: Interactive 3D cards, tilt effects, layered isometric mockups.
   - *Overhead*: Minimal; runs directly on compositor thread without WebGL initialization.
2. **Interactive Canvas 2.5D / Particle Systems**:
   - *Best For*: Floating constellation lines, reactive cursor particle fields.
   - *Overhead*: Extremely low memory; native 2D canvas context.
3. **Three.js & React Three Fiber (R3F)**:
   - *Best For*: True 3D object rendering, PBR materials, dynamic lighting, interactive product models, camera fly-throughs.
   - *Overhead*: Requires GPU allocation, WebGL context, shader compilation, and asset loading.
4. **Spline Runtime**:
   - *Best For*: Rapid collaborative 3D scene authoring with visual UI tools.
   - *Overhead*: Heavy runtime export; best suited for targeted hero sections when custom code is unnecessary.

---

## 2. React Three Fiber (R3F) Best Practices

### Canvas Setup with DPR Clamping
```tsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Float, MeshDistortMaterial } from '@react-three/drei';

export function SceneCanvas() {
  return (
    <Canvas
      dpr={[1, 1.5]} // Strictly clamp device pixel ratio to max 1.5 to prevent 4K mobile GPU thermal throttling
      camera={{ position: [0, 0, 5], fov: 45 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1.2} />
      <Float speed={2} rotationIntensity={0.8} floatIntensity={1.2}>
        <mesh>
          <sphereGeometry args={[1, 64, 64]} />
          <MeshDistortMaterial color="#e0e0e0" roughness={0.1} metalness={0.8} distort={0.3} speed={2} />
        </mesh>
      </Float>
      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.5} />
    </Canvas>
  );
}
```

---

## 3. Performance & Asset Optimization Checklist

- **Geometry Instancing**: Never render 1,000 distinct meshes. Always use `THREE.InstancedMesh` to consolidate 1,000 objects into a single draw call.
- **Model Compression**: Pass all `.gltf` / `.glb` models through Google Draco or Meshopt compression (`gltf-transform optimize input.glb output.glb`).
- **Texture Resolutions**: Cap background textures at 1024x1024 or 2048x2048 maximum; convert to `.webp` or Basis Universal (`.ktx2`).
- **Context Disposal & Cleanup**: Always call `geometry.dispose()`, `material.dispose()`, and cancel the `requestAnimationFrame` loop when components unmount to prevent catastrophic browser memory leaks.
- **Mobile Fallback**: Detect low-power devices, slow network (Network Information API), or small viewports; downgrade the scene to an optimized WebP animation or clean CSS illustration.
