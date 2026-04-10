# Layout and Spacing

## Spacing Scale
Use a constraint-based spacing system. Start with a base unit (4px or 8px) and build a scale where no two adjacent values are closer than ~25% apart.

Recommended scale: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128px

Never use arbitrary values like 13px or 7px — always pick the nearest scale value.

## Don't Fill the Screen
- Right-size elements to their content, not to fill available space.
- A form doesn't need to be 100% width because the screen is wide.
- Use `max-width` constraints on content areas (e.g., `max-w-prose` for text, `max-w-lg` for forms).

## Grids
- Avoid percentage-based grids for layout. Prefer fixed-width sidebars with flexible main content.
- Use CSS Grid or Flexbox rather than Bootstrap-style column math.
- Not every element needs to be part of a grid — let components breathe.

## Density
- Default to generous whitespace; it signals quality.
- Add density only for power-user data-dense views (dashboards, tables).
- When in doubt, add more padding, not less.

## Relative Sizing Pitfalls
- Avoid using `em` for spacing — it compounds unexpectedly in nested elements.
- Use `rem` or fixed `px` for spacing values.
- Percentage widths are fine for responsive layouts, but pair them with `max-width`.

## Mobile
- Design for mobile constraints first, then expand for larger screens.
- Stack elements vertically on small screens rather than shrinking them.
- Touch targets: minimum 44×44px for interactive elements.
