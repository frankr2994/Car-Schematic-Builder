# Testing Guide

This guide describes how to run and write tests for the Wiring Schematic Designer project.

---

## 1. Running Tests

The test suite is powered by [Vitest](https://vitest.dev/) and [@testing-library/react](https://testing-library.com/).

```bash
# Run test suite once
npm test

# Run Vitest in watch mode
npm run test:watch

# Run TypeScript type check
npm run typecheck

# Run ESLint check
npm run lint

# Run Next.js production build verification
npm run build
```

---

## 2. Test Architecture

The tests are organized under `src/__tests__/`:

| Test File | Scope |
|---|---|
| `compiler.test.ts` | Tests circuit template compilation into concrete project documents, terminal role matching, ID factory, and failure conditions. |
| `validation.test.ts` | Tests Zod schema validation, malformed document detection, and auto-repair logic. |
| `page.test.tsx` | End-to-end integration tests for the Next.js page, `localStorage` persistence, reset flow, and React Flow canvas rendering. |
| `wiring-layout.test.ts` | Unit tests for library-independent layout calculations, ELK graph construction, and geometry token adherence. |
| `wiring-adapter.test.ts` | Unit tests for project-to-layout request adaptation and view model transformation. |
| `wiring-diagnostics.test.ts` | Unit tests for wire continuity states, diagnostic overlays, and toggling logic. |

---

## 3. Important Testing Practices

### React Flow & `ResizeObserver`
React Flow requires the DOM `ResizeObserver` API to measure nodes and container dimensions. Because JSDOM does not provide `ResizeObserver` out of the box, all component/page tests that mount React Flow must define a mock:

```ts
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock;
```

### Headless Layout Unit Testing
The layout subsystem is decoupled from DOM and React Flow:
- `projectToLayoutRequest(project)` transforms domain entities into pure data requests.
- `layoutProject(project)` or `layoutWiringRequest(request)` executes the ELK layered algorithm and produces normalized coordinates without requiring browser rendering.
- Always write layout tests against these pure functions to keep tests fast and deterministic.

### View Model & Diagnostic Decoupling
Diagnostic updates must not trigger layout recomputation. When testing wire fault toggles or status updates:
- Verify that `buildWiringViewModel` generates the appropriate stroke styles, dash arrays, and data payloads.
- Verify that node positions remain unchanged when diagnostic states toggle.
