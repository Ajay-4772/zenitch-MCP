# Master Knowledge: UI/UX Design Fundamentals & Disciplines

---

## 1. UX Research & Product Strategy

### A. Core Methodologies
- **Jobs To Be Done (JTBD)**: Understand the functional, emotional, and social job the user is hiring the software to accomplish.
  - *Formula*: "When [Situation], I want to [Motivation], so that [Expected Outcome]."
- **User Personas & Mental Models**: Move beyond demographic stereotypes to behavioral archetypes defined by goals, technical comfort, cognitive load constraints, and high-frequency friction points.
- **Journey Mapping & Flow Engineering**:
  - Map stages: Awareness -> Discovery -> Evaluation -> Onboarding -> Habituation -> Troubleshooting.
  - Identify transition moments where drop-off risk is highest; design positive reinforcement feedback loops.
- **Information Architecture (IA)**:
  - Top-down taxonomy (hierarchical navigation structures).
  - Bottom-up metadata (filtering, tagging, contextual cross-linking).
  - Card sorting (open vs closed) to structure menus matching users' intuitive mental models.

### B. Usability Heuristics (Nielsen-Norman Standard Applied)
1. **Visibility of System Status**: Real-time feedback for every user interaction within 100ms (hover highlights, active press states, skeleton loaders, determinate progress bars).
2. **Match Between System and the Real World**: Clear plain-language copy; icons with unambiguous real-world semantics.
3. **User Control and Freedom**: Clear exit routes; non-destructive undo mechanisms (`⌘Z`, toast "Undo" actions); dismissible modals.
4. **Consistency and Standards**: Platform conventions respected (Esc closes dialogs, Tab cycles focus forwards, Shift+Tab cycles backwards).
5. **Error Prevention and Graceful Recovery**: Inline validation on field blur (never prematurely while typing); actionable error messages stating *what happened* and *how to fix it*.

---

## 2. Interaction Design & Micro-Interactions

Micro-interactions are the heartbeat of a premium digital experience. Every micro-interaction follows Dan Saffer’s 4-part model:
1. **Trigger**: User initiated (hover, click, scroll, keyboard press) or system initiated (status alert).
2. **Rules**: State machine governing behavior (e.g., button enters `loading` state, disables re-clicks, sets `aria-busy="true"`).
3. **Feedback**: Immediate sensory signal (100ms smooth transition, subtle scale dampening `transform: scale(0.98)`, border glow shift).
4. **Loops & Modes**: Context-dependent states (e.g., success state checkmark holding for 1.2s before collapsing into idle).

### Key State Matrix for Interactive Elements
Every interactive element must explicitly define all 6 universal states:
- `idle`: Baseline elevation, legible contrast.
- `hover`: Elevated visual cue (subtle brightness shift, soft shadow expansion, slight Y-translation -1px to -2px).
- `focus-visible`: High-contrast, non-obscured focus ring (`outline: 2px solid var(--accent); outline-offset: 2px;`).
- `active / press`: Tactile feedback (`transform: scale(0.97)` or inset shadow).
- `disabled`: Muted contrast (`opacity: 0.5; pointer-events: none; aria-disabled="true"`).
- `loading`: Replaced by a smooth non-jittering spinner or skeleton shimmer with `aria-busy="true"`.
