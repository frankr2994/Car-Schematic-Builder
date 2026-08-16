# Wiring Schematic Designer - UX & User Guide

This document details the user experience, interaction model, styling conventions, and lifecycle behaviors for the Wiring Schematic Designer.

---

## 1. Visual Design Philosophy: 1960s/70s Service Manual Theme

The interface adheres to a high-contrast, vintage automotive service manual design:

- **Monospace Typography**: Clean monospaced font stacks (`ui-monospace`, `Courier New`, `Menlo`) for technical clarity.
- **Component Geometry**: Solid black 2px borders (`border-2 border-black`), pale gray header badges (`bg-gray-200`), and dedicated zone callouts in the footer (`Zone: Engine Bay`, `Zone: Dash`, `Zone: Rear`).
- **Terminal Alignment**: Source terminals are anchored to the right edge (`EAST`), and target terminals are anchored to the left edge (`WEST`) with accurate vertical spacing.
- **Wire Rendering**: High-contrast orthogonal and smoothstep conductor paths with clear color identification and gauge metadata.

---

## 2. Interactive Editing & Layout

### Automatic Placement
When a project loads or its circuit topology changes, the layout engine uses the **ELK Layered Algorithm** to calculate optimal node positions and port alignments automatically from left to right (power sources $\to$ switches/protection $\to$ loads $\to$ ground returns).

### Drag & Layout Overrides
- Users can click and drag any component node across the canvas.
- When dragging completes (`onNodeDragStop`), the new coordinates are saved to `project.layoutOverrides[instanceId] = { x, y, locked: false }`.
- Layout overrides persist across page reloads via `localStorage` and take precedence over automatic ELK node positions.
- Clicking **Reset** clears overrides and restores the canonical template layout.

---

## 3. Interactive Wire Diagnostics & Fault Toggles

The schematic provides an interactive diagnostic overlay for visual circuit debugging:

- **Continuity States**:
  1. **OK / Normal** (`normal`): Solid conductor stroke, green indicator dot, standard wire insulation color.
  2. **Open / Fault** (`open`): Dashed conductor stroke (`6,6`), red indicator dot, red highlight stroke indicating broken continuity.
  3. **Unknown** (`unknown`): Dotted conductor stroke (`2,2`), gray indicator dot, gray highlight stroke indicating unverified continuity.

- **Interactive Toggle**:
  - Each wire displays an interactive pill badge at its midpoint (`EdgeLabelRenderer`).
  - Clicking the badge cycles through continuity states: `Normal -> Open -> Unknown -> Normal`.
  - Diagnostics update in real-time without recalculating the ELK topology or resetting the camera viewport.

---

## 4. Print & Export Lifecycle

- Clicking **Print PDF** or pressing `Ctrl+P` / `Cmd+P` triggers the browser print dialog.
- The `beforeprint` event listener automatically calls `fitView({ padding: 0.1 })` to frame the schematic optimally on paper.
- Print CSS rules:
  - Hide toolbars, background dot grids, navigation controls, and interactive legends (`print:hidden`).
  - Render an authentic printable service manual **Title Block** in the bottom-right corner with Project Name, Date, and Sheet Number (`1 of 1`).
  - Normalize background colors to pure white and maintain black vector strokes.

---

## 5. Accessibility

- **Keyboard Navigation**: Component nodes feature focus rings (`:focus-visible`) and `tabIndex={0}`.
- **Screen Reader Support**:
  - Nodes use `role="region"` with descriptive `aria-label`s specifying component name and zone.
  - Wire handles and diagnostic badges include descriptive `aria-label`s (e.g. `Wire wire_123: status is open. Click to toggle fault state.`).
- **Dual Visual Encoding**: Faults are conveyed via both color (green/red/gray) and line style (solid/dashed/dotted) as well as text labels (`OK`, `OPEN`, `UNK`), ensuring full accessibility for color-blind users.
