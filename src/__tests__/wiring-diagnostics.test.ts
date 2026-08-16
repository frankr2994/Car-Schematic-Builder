import { describe, it, expect, vi } from "vitest";
import { compileTemplate } from "../compiler/compiler";
import { templates } from "../catalog/components";
import {
  buildWiringViewModel,
  WiringLayoutResult,
  WireDiagnostics,
  WIRING_THEME,
} from "../wiring";

describe("Wiring Diagnostics & Fault Overlays", () => {
  const sampleProject = compileTemplate(templates[0]);
  const mockLayoutResult: WiringLayoutResult = { nodes: {} };
  const firstWireId = sampleProject.wires[0].id;

  it("applies normal state styling by default", () => {
    const viewModel = buildWiringViewModel(sampleProject, mockLayoutResult);
    const edge = viewModel.edges.find((e) => e.id === firstWireId);

    expect(edge?.data.diagnostic.continuity).toBe("normal");
    expect(edge?.style?.strokeDasharray).toBeUndefined();
  });

  it("applies dashed red stroke for open circuit faults", () => {
    const diagnostics: WireDiagnostics = {
      [firstWireId]: { continuity: "open" },
    };

    const viewModel = buildWiringViewModel(sampleProject, mockLayoutResult, diagnostics);
    const edge = viewModel.edges.find((e) => e.id === firstWireId);

    expect(edge?.data.diagnostic.continuity).toBe("open");
    expect(edge?.style?.stroke).toBe(WIRING_THEME.colors.diagnostics.open);
    expect(edge?.style?.strokeDasharray).toBe(WIRING_THEME.dashPatterns.open);
  });

  it("applies dotted gray stroke for unknown diagnostic states", () => {
    const diagnostics: WireDiagnostics = {
      [firstWireId]: { continuity: "unknown" },
    };

    const viewModel = buildWiringViewModel(sampleProject, mockLayoutResult, diagnostics);
    const edge = viewModel.edges.find((e) => e.id === firstWireId);

    expect(edge?.data.diagnostic.continuity).toBe("unknown");
    expect(edge?.style?.stroke).toBe(WIRING_THEME.colors.diagnostics.unknown);
    expect(edge?.style?.strokeDasharray).toBe(WIRING_THEME.dashPatterns.unknown);
  });

  it("attaches the onToggleDiagnostic callback to edge data", () => {
    const mockToggle = vi.fn();
    const viewModel = buildWiringViewModel(
      sampleProject,
      mockLayoutResult,
      {},
      mockToggle
    );

    const edge = viewModel.edges.find((e) => e.id === firstWireId);
    expect(edge?.data.onToggleDiagnostic).toBe(mockToggle);

    edge?.data.onToggleDiagnostic?.(firstWireId);
    expect(mockToggle).toHaveBeenCalledWith(firstWireId);
  });

  it("marks edge data as readOnly when onToggleDiagnostic is omitted", () => {
    const viewModel = buildWiringViewModel(sampleProject, mockLayoutResult, {});
    const edge = viewModel.edges.find((e) => e.id === firstWireId);

    expect(edge?.data.readOnly).toBe(true);
    expect(edge?.data.onToggleDiagnostic).toBeUndefined();
  });
});
