# Nexusky — Design System

## Colors (OKLCH)

### Dark Theme (Primary)

| Role | OKLCH | Hex (approx) | Usage |
|------|-------|--------------|-------|
| Background | oklch(0.10 0.008 270) | #0f0f16 | App base |
| Surface | oklch(0.13 0.008 270) | #16161f | Panels, cards |
| Elevated | oklch(0.17 0.008 270) | #1e1e2a | Hover states, inputs |
| Border | oklch(0.22 0.006 270) | #2a2a38 | Dividers, outlines |
| Text Primary | oklch(0.92 0.008 270) | #e8e8f0 | Body text |
| Text Secondary | oklch(0.60 0.008 270) | #8888a0 | Labels, hints |
| Accent | oklch(0.58 0.18 280) | #7c6ef0 | Primary actions, links |
| Accent Hover | oklch(0.52 0.18 280) | #6a5ce0 | Hover on accent |
| Accent Subtle | oklch(0.20 0.04 280) | #1e1a3a | Accent backgrounds |
| Success | oklch(0.70 0.15 155) | #4ade80 | Confirmations |
| Warning | oklch(0.75 0.12 85) | #fbbf24 | Cautions |
| Danger | oklch(0.65 0.15 25) | #f87171 | Destructive |

### Strategy: Restrained

Tinted neutrals (blue-violet hue 270) + single accent (violet 280). Accent used sparingly: active states, primary CTAs, indicators.

## Typography

| Role | Font | Size | Weight | Line Height |
|------|------|------|--------|-------------|
| Body | Inter | 15px | 400 | 1.7 |
| H1 | Inter | 30px | 700 | 1.2 |
| H2 | Inter | 24px | 600 | 1.3 |
| H3 | Inter | 20px | 600 | 1.4 |
| UI Label | Inter | 13px | 500 | 1.4 |
| Code | JetBrains Mono | 13px | 400 | 1.6 |
| Sidebar | Inter | 13px | 400 | 1.4 |

## Spacing

Base unit: 4px. Scale: 4, 8, 12, 16, 20, 24, 32, 48, 64.

- Component padding: 12–16px
- Section gaps: 24–32px
- Sidebar item height: 32px
- Input height: 32px

## Elevation

No box-shadows in dark mode. Use border + subtle background shifts for depth.

## Radius

- Small (inputs, tags): 6px
- Medium (cards, panels): 8px
- Large (modals, dialogs): 12px
- Pill (badges): 9999px

## Motion

- Duration: 150ms (micro), 200ms (state), 300ms (layout)
- Easing: cubic-bezier(0.4, 0, 0.2, 1)
- Prefer opacity + transform over color transitions

## Components

### Sidebar
- Width: 240px
- Background: oklch(0.08 0.008 270)
- Items: 32px height, 6px radius, 8px horizontal padding
- Active: accent-subtle background + accent text
- Hover: elevated background

### Editor
- Max width: 720px, centered
- Padding: 32px horizontal, 24px vertical
- Focus mode: sidebar collapses, full-width editor

### Title Bar
- Height: 32px
- Background: matches sidebar
- Drag region with minimal branding
