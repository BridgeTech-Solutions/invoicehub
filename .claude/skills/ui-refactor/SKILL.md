# UI Refactoring and Design

This skill provides systematic approaches to interface design, applying principles from *Refactoring UI* by Adam Wathan & Steve Schoger.

## Core Approach

Do not start by designing a "shell" (nav bars, sidebars). Start with the specific functionality. Work low-fidelity and grayscale first to solve layout before applying visual polish.

Establish constraint systems immediately — define restrictive systems for spacing, type, and color rather than making arbitrary styling choices each time.

**Constraint systems to define upfront:**
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px
- Type scale: 12, 14, 16, 18, 20, 24, 30, 36px
- Color palette: 8–10 greys + 5–10 primary shades + semantic accent colors

## Workflow

1. **Start functional, not aesthetic** — design the core feature first
2. **Apply hierarchy** — use weight, color, size to signal importance
3. **Establish spacing** — use the scale, never arbitrary values
4. **Typography** — set line-height and alignment rules
5. **Color** — HSL-based palettes with accessible contrast
6. **Polish** — shadows, borders, empty states, finishing touches

## Reference Documents

- `references/hierarchy.md` — Visual hierarchy tactics
- `references/layout-spacing.md` — Spacing systems & grids
- `references/typography.md` — Type scales & fonts
- `references/color.md` — HSL palettes & contrast
- `references/depth-and-polish.md` — Shadows & finishing touches

## Key Principles

- If you can't decide between two options, you have too many choices — add a constraint
- De-emphasize competing elements rather than amplifying the primary one
- Design core UX before edge cases
- Personality-driven choices guide aesthetic direction
- Accessible contrast: 4.5:1 minimum for normal text (WCAG AA)
