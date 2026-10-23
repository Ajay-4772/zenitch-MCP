# Production Component Specifications: Buttons & Interactive Triggers

---

## 1. Component Archetypes

### A. The Magnetic Glassmorphic Button
- **Aesthetic**: Premium dark mode or frosted luxury light mode.
- **Interaction**: Tracks cursor proximity within 60px and subtly shifts toward the pointer with spring physics.
- **CSS Implementation**:
```css
.btn-magnetic-glass {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 1.75rem;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.4);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.btn-magnetic-glass:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.25);
  box-shadow: 0 8px 30px -4px rgba(0, 0, 0, 0.6);
  transform: translateY(-2px);
}

.btn-magnetic-glass:active {
  transform: translateY(0) scale(0.98);
}

.btn-magnetic-glass:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 3px;
}
```

### B. The Radiant Shimmer CTA
- **Aesthetic**: Modern high-converting SaaS action button with subtle moving metallic gradient border.
- **Tailwind Pattern**:
```tsx
export function RadiantButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative inline-flex h-11 items-center justify-center overflow-hidden rounded-full p-[1px] focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 focus:ring-offset-neutral-900 transition-transform active:scale-95"
    >
      <span className="absolute inset-[-1000%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#E2CBFF_0%,#393BB2_50%,#E2CBFF_100%)]" />
      <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-full bg-neutral-950 px-6 py-1 text-sm font-medium text-white backdrop-blur-3xl transition-colors hover:bg-neutral-900">
        {children}
      </span>
    </button>
  );
}
```

---

## 2. Accessibility Checklist for Buttons
- Explicit `type="button"` or `type="submit"` (prevents unintended form submissions).
- Contrast ratio >= 4.5:1 between label text and background.
- Minimum bounding box 44x44px for touch interfaces.
- Clear non-hidden `:focus-visible` indicator.
