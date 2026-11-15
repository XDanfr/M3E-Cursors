# Animation spec

## What the platform allows

These limits come from MaCursor's source (`CursorEngine/MACCursorDefinitions.swift`,
`CursorThemeWriter.swift`), not from guesswork:

| Constraint | Value | Consequence |
|---|---|---|
| Frames per cursor | Any number in the `.cursor` file. 24 when applied (`maxFrameCount`) | MaCursor imports and previews long strips at full rate. Its engine (`MACCursorActions.prepareImages`) resamples anything over 24 frames to 24 when it applies the theme |
| Frame timing | One `FrameDuration` for every frame | You can't hold one frame longer than another, except by repeating it |
| Playback | Loops forever while the cursor is visible | Nothing plays once, and nothing reacts to state changes |
| Transitions | macOS swaps cursor images instantly | You can't animate *between* two cursors (open hand to closed hand) |
| Reduced motion | Cursors can't see the system setting | Reduced motion ships as a second theme |

## 1. Loading indicator (Wait, `cursor.4`)

Source: `@m3e/web` `m3e-loading-indicator`, `variant="contained"` (repo:
`packages/web/src/loading-indicator/LoadingIndicatorElement.ts`). The frames come from rendering
that component in Chrome. Nothing is redrawn by hand.

What the component does, as read from its source:

- **Outer wrapper:** `rotate-outer`, 4666 ms, linear, turns 0° → 360°.
- **Active shape:** `rotate-inner`, 4666 ms, `cubic-bezier(0.34, 0.88, 0.34, 1)` per keyframe segment.
- **Shape sequence:** soft-burst (0 %) → 9-sided cookie (14 %) → pentagon (29 %) → pill (43 %) → sunny (57 %) →
  4-sided cookie (71 %) → oval (83 %) → soft-burst (100 %).
- **Inner rotation:** 0° → 154° → 309° → 463° → 617° → 771° → 926° → 1080°, on top of the outer turn.
- **Morphing:** the shapes are `clip-path` polygons, each normalised to 300 points by `generateClipPaths`.
- **Container:** a circle (`corner.full`), 48 px across. The active indicator is 38 px, drawn at 0.842 of that.

How the cursor renders it:

- The component is paused, then each frame is placed with `Animation.currentTime = i × 4666 / 280`.
- Each frame is rendered as vector at 1×, 2× and 5×. A 10× strip of 280 frames would be about 115 MB once decoded.
- **Sizes:** the standalone Wait cursor uses a 24 pt container. The arrow badge (`cursor.4`) uses 13 pt.
  The active size is container × 38/48 in both cases, so the official proportion holds.
- **Colours:** container `#EADDFF`, active shape `#21005D`. Both are set through the component's own
  CSS custom properties.
- **Edge treatment:** the only addition is the white rim and dark hairline that every cursor in the
  theme gets. They keep the pale container visible on white. The animation itself is unchanged.
- **Timing:** 280 frames × 16.66 ms = 4.666 s, which is the component's own cycle at 60 fps. The MD3E
  Cursors gallery theme uses the same layout.
- **Frame rate:** MaCursor's editor preview plays all 280 frames. According to MaCursor's source, its
  engine samples 24 of them evenly when it applies the theme system-wide, about 5 fps. That's the
  same as for every other theme with more than 24 frames.
- The cycle isn't shortened or sped up, so the official timing holds either way.
- **Reduced motion:** the reduced-motion theme holds frame 0 (soft-burst), as the component does.

## 2. Upload / copy drop (Copy, `cursor.5`)

This is the cursor macOS shows while you drag something onto a target that will copy it, for
example a file over a browser upload area.

- 24 frames × 100 ms gives a 2.4 s loop.
- **0 – 600 ms:** the FAB badge holds a **plus**.
- **From 700 ms:** the plus morphs into an **upload arrow**. Its horizontal arm folds up into the arrowhead.
  - The glyph follows the M3E default-effects spring (damping 1.0, stiffness 1600), so it doesn't overshoot.
  - The FAB grows to 1.10× on the M3E expressive spatial spring (damping 0.8, stiffness 380), with a small overshoot.
- **From 1.8 s:** both springs run in reverse and settle back on the plus before the loop restarts.
- The arrow tip doesn't move, so the cursor stays easy to aim.
- **"Accepted" checkmark:** not implemented. macOS has no cursor role for "drop accepted", so a
  checkmark would show during the drag, before anything has been accepted.

## 3. Grab → grabbing

Both hands are static. macOS replaces the open-hand image with the closed-hand image instantly, and
cursor animations can only loop. A "closing" animation on the closed hand would replay every cycle
for as long as you drag. That is the constant bouncing the brief rules out. The two hands are drawn
on the same palm and pill grid, so the swap reads as one hand closing.

## Easing reference

| Use | Spring |
|---|---|
| Spatial (scale, position) | damping 0.8, stiffness 380: M3E expressive default spatial |
| Effects (morph, colour) | damping 1.0, stiffness 1600: no overshoot (M3E default effects) |

See `spring()` in `design/geometry.mjs`.
