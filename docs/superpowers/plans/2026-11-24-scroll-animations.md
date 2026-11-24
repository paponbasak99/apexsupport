# Scroll-Reveal Animations Implementation Plan

Smooth, hardware-accelerated scroll-reveal animations across all sections, headers, cards, FAQ items, and footer for the Apex Official Error Fix Website.

## Proposed Architecture

1. **Progressive Enhancement CSS**:
   - Scope initial hidden states under `html.has-scroll-anim`.
   - Animate strictly composite-only properties (`transform: translate3d(...)`, `opacity`).
   - Premium cubic bezier curve: `cubic-bezier(0.16, 1, 0.3, 1)`.
   - Staggered nth-child delays for grid cards (0.04s, 0.12s, 0.20s, 0.28s, 0.36s...).
   - Preserve `.card:hover` elevation (`translate3d(0, -6px, 0)`).
   - Full accessibility fallback: `@media (prefers-reduced-motion: reduce)`.

2. **IntersectionObserver Engine in `public/js/script.js`**:
   - Check `window.IntersectionObserver`.
   - Add `html.has-scroll-anim`.
   - Target `.section__header`, `.card`, `.faq-item`, `.footer-pro`.
   - Unobserve once revealed for zero scroll-loop overhead.
   - Auto-reveal targets on hash navigation and active search.

3. **Verification**:
   - Automated Headless Chrome test verifying scroll triggers, `.revealed` classes, zero console errors, 60fps compositor transitions.
   - Full page screenshots during scroll to capture active animations.
