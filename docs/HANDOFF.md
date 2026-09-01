# Project Handoff

## [2026-08-14T02:16:25.587Z] Baseline changes

* Preserved untracked configuration files in the `.idea` directory, including `.gitignore`, `encodings.xml`, `indexLayout.xml`, and `vcs.xml`.

## [2026-08-14T04:03:59.446Z] Baseline changes

- Updated `.gitignore` to include new ignore patterns for dependencies, build outputs, and environment files.
- Removed old ignore patterns related to coverage and build directories from the end of the file.
- Many files were untracked; these are preserved as requested.

## [2026-08-15T01:43:53.826Z] Refactor: Update project structure, validation, and UI for Wiring Schema

- Updated `README.md` to reflect the new schematic designer features and scripts.
- Added `zod` schema validation in `package.json`, `package-lock.json`, and implemented comprehensive Zod schemas in `src/domain/validation.ts` for project parsing.
- Refactored `src/compiler/compiler.ts` to include detailed template compilation logic, including role validation, component catalog checks, connection port validation (source/target direction), and ID generation.
- Updated `src/app/page.tsx` to use the new storage mechanism (`storage.save`/`load`) for persisting project state instead of direct `localStorage` manipulation.
- Enhanced `src/components/WiringDiagram.tsx` with React Flow integration, improved node styling (including print styles), and implemented logic for handling node dragging and layout overrides persistence via `onNodeDragStop`.

## [2026-08-16T04:00:04.052Z] Baseline changes

- Extract the diagram, layout, and model into `src/wiring` with its own CSS
- Add WireDiagnostics state in Home so users can toggle wire status (OK/Open/Unk)
- Replace old ELK graph builder with a normalized project adapter for consistent layouts
- Verify: check that wiring.css loads correctly and the new diagnostic legend renders

## [2026-08-16T04:13:12.920Z] fix toggleWireDiagnostic to preserve label and notes

- Spread the existing wire object into toggleWireDiagnostic so non-continuity fields (label, notes) are not dropped
- Add tests verifying metadata is retained through multiple toggles in both wiring-diagnostics.test and wiring-diagram.test

## [2026-08-16T05:23:55.000Z] Phase 1: Interactive Canvas Authoring & Connection Validation

- Centralize domain editing commands and validation rules in `src/domain/connectionRules.ts` and `src/domain/projectCommands.ts` with structured `EditResult` returns.
- Add schema migration support in `src/domain/migrations.ts` supporting schema versions 1.0 and 2.0 with undirected dual endpoints (`a` and `b`), `gaugeAwg`, `colorCode`, `label`, and `notes`.
- Expand catalog in `src/catalog/components.ts` with multi-terminal devices (5-Pin SPDT Relay, 4-Pin NO Relay, Ignition Switch, Turn Flasher, Starter Motor, Voltmeter Gauge, 3-Way Splice Junction) and the `relay_headlight` template.
- Enable interactive handle-to-handle wire creation, reconnection, cascade deletion, and drag-and-drop placement in `WiringCanvas.tsx` and `WiringDiagram.tsx`.
- Add `Palette.tsx` library sidebar and `Inspector.tsx` property editor for components and wires.
- Integrate full workbench UI into `src/app/page.tsx`.
- Comprehensive test coverage in `connectionRules.test.ts`, `projectCommands.test.ts`, `migrations.test.ts`, `palette-and-inspector.test.tsx`, and existing suites.

## [2026-08-16T05:35:10.000Z] Fixes: Unsupported schema version guard, endpoint conflict rejection & canvas integration tests

- Reject unsupported future schema versions in `storage.load` and `migrateProject` to prevent silent downgrades.
- Validate and reject conflicting endpoint representations between legacy (`sourceInstance`/`targetInstance`) and dual (`a`/`b`) fields across `validation.ts` and `migrations.ts`.
- Add comprehensive `WiringDiagram` integration test suite in `wiring-canvas-interaction.test.tsx` exercising `isValidConnection`, `onConnect`, `onReconnect`, `onNodesDelete`, `onEdgesDelete`, and palette `drop` events.

## [2026-08-24T01:12:56.969Z] Auto-committed baseline

- Migrate project documents to a unified v2.0 representation
- Add lengthMm, routeOverride and preserve physical attributes (colorCode, gaugeAwg)
- Enforce either legacy or dual endpoint definitions via cross-field validation
- Reject conflicting representations during parse with migration conflict detection
- Guard against unsupported future versions and reject both-source/both-target pairings
- Add wiring-canvas interaction tests for connect, reconnect, delete

## [2026-08-24T01:52:30.142Z] feat(wiring): add alternator, SPDT switches and circuit recipes

- Add `alternator.12v` with B+/excite terminals and a starter/charging recipe
- Introduce `switch.spdt` for multi-position toggles; update headlight dimmer logic
- Implement port redirection in planCircuitInsertion to route wires through available terminals
- Default unassigned components and wire endpoints to the System Overview sheet

## [2026-08-29T21:28:16.531Z] fix wiring reconnection logic, layout edge cases, and prototype pollutio

- Guard wire updates against ambiguous or no-change edits
- Add deterministic fallback node positioning for partial ELK results
- Use Object.create(NULL) for the layout map to prevent prototype pollution
- Inject elkInstance into wiring requests instead of a global import
- Detect dropped nodes after layout before falling back

## [2026-08-30T00:58:12.396Z] feat(export): add auto-scaling and readability warning for dense schemat

- Add canvas export with a density cap (max 1.0) so large layouts fit
- Show an auto-scale banner when the layout is too dense (>55% of bounds)
- Escape all SVG text via `escapeXml` to prevent broken XML from special chars
- Include revision number in each sheet's subtitle for version tracking

## [2026-09-01T04:27:40.185Z] feat(wiring): add annotation layer, circuit templates and playback

- Add text/hotspot annotations with severity levels to project schemas
- Implement CRUD endpoints for annotations and a migration path preserving existing ones
- Introduce CircuitTemplate for reusable layouts with category, description, and tags
- Render an overlay of annotated nodes on the wiring canvas via AnnotationNode
- Style faulted/active components with color-coded states (shorted, backfeed, powered)
- Add simulation playback controls including a seek bar and per-tick fault highlighting
