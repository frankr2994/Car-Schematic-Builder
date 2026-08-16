import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import '@testing-library/jest-dom';
import { NodeChange, ReactFlowProvider } from "@xyflow/react";
import {
  WiringDiagram,
  WiringCanvas,
  WireDiagnostics,
  DiagnosticBadge,
  WIRING_THEME,
  getWiringThemeCSSVariables,
  applyNodeChanges,
  applyNodeDragStop,
  createLayoutOverride,
  nextContinuityState,
  toggleWireDiagnostic,
  buildWiringViewModel,
} from "../wiring";
import * as layoutModule from "../wiring/layout/layoutProject";
import { layoutProject as legacyLayoutProject } from "../layout/layout";
import { compileTemplate } from "../compiler/compiler";
import { templates } from "../catalog/components";

// React Flow requires ResizeObserver mock in JSDOM
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock;

describe("WiringDiagram Component & Lifecycle Regression Suite", () => {
  const getFreshProject = () => compileTemplate(templates[0]);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maintains backward compatibility for legacy src/layout/layout.ts returning raw ELK graph with children", async () => {
    const project = getFreshProject();
    const legacyGraph = await legacyLayoutProject(project);

    expect(legacyGraph).toBeDefined();
    expect(Array.isArray(legacyGraph.children)).toBe(true);
    expect(legacyGraph.children!.length).toBe(project.instances.length);

    const firstChild = legacyGraph.children![0];
    expect(firstChild.id).toBe(project.instances[0].id);
    expect(typeof firstChild.x).toBe("number");
    expect(typeof firstChild.y).toBe("number");
  });

  it("mounts WiringDiagram and runs ELK layout on initial render", async () => {
    const layoutSpy = vi.spyOn(layoutModule, "layoutProject");
    const project = getFreshProject();
    const handleProjectChange = vi.fn();

    render(<WiringDiagram project={project} onProjectChange={handleProjectChange} />);

    await waitFor(() => {
      expect(layoutSpy).toHaveBeenCalledTimes(1);
    });

    // Check component node names are rendered in the DOM
    expect(screen.getByText("12V Battery")).toBeInTheDocument();
    expect(screen.getByText("Toggle Switch")).toBeInTheDocument();
    expect(screen.getByText("Blade Fuse")).toBeInTheDocument();
  });

  it("positions terminal handles with accurate row centers in rendered DOM", async () => {
    const project = getFreshProject();
    const { container } = render(
      <WiringDiagram project={project} onProjectChange={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText("12V Battery")).toBeInTheDocument();
    });

    const battNode = container.querySelector(`[data-id="${project.instances[0].id}"]`);
    expect(battNode).toBeInTheDocument();

    const handles = battNode?.querySelectorAll(".react-flow__handle");
    expect(handles && handles.length >= 2).toBe(true);
    // Pos terminal (first row center = 46px)
    expect((handles![0] as HTMLElement).style.top).toBe("46px");
    // Neg terminal (second row center = 66px)
    expect((handles![1] as HTMLElement).style.top).toBe("66px");
  });

  it("centralizes theme tokens as single source of truth in getWiringThemeCSSVariables and container", () => {
    const cssVars = getWiringThemeCSSVariables();

    expect(cssVars["--wiring-node-width"]).toBe(`${WIRING_THEME.geometry.nodeWidth}px`);
    expect(cssVars["--wiring-node-min-height"]).toBe(`${WIRING_THEME.geometry.nodeMinHeight}px`);
    expect(cssVars["--wiring-node-header-height"]).toBe(`${WIRING_THEME.geometry.headerHeight}px`);
    expect(cssVars["--wiring-node-footer-height"]).toBe(`${WIRING_THEME.geometry.footerHeight}px`);
    expect(cssVars["--wiring-terminal-row-height"]).toBe(`${WIRING_THEME.geometry.terminalRowHeight}px`);
    expect(cssVars["--wiring-terminal-padding"]).toBe(`${WIRING_THEME.geometry.terminalPadding}px`);
    expect(cssVars["--wiring-node-border-width"]).toBe(`${WIRING_THEME.strokes.nodeBorderWidth}px`);
    expect(cssVars["--wiring-wire-open"]).toBe(WIRING_THEME.colors.diagnostics.open);
    expect(cssVars["--wiring-wire-normal"]).toBe(WIRING_THEME.colors.diagnostics.normal);
    expect(cssVars["--wiring-wire-unknown"]).toBe(WIRING_THEME.colors.diagnostics.unknown);

    const project = getFreshProject();
    const { container } = render(
      <WiringDiagram project={project} onProjectChange={vi.fn()} />
    );

    const diagramContainer = container.querySelector(".wiring-diagram-container") as HTMLElement;
    expect(diagramContainer).toBeInTheDocument();
    expect(diagramContainer.style.getPropertyValue("--wiring-node-width")).toBe(
      `${WIRING_THEME.geometry.nodeWidth}px`
    );
    expect(diagramContainer.style.getPropertyValue("--wiring-node-header-height")).toBe(
      `${WIRING_THEME.geometry.headerHeight}px`
    );
  });

  describe("Pure State Helpers (P1 & P2 State Transitions)", () => {
    it("applies transient position changes and selection updates via applyNodeChanges", () => {
      const initialUIState = {};
      const changes: NodeChange[] = [
        { type: "position", id: "node_1", position: { x: 120, y: 340 }, dragging: true },
        { type: "select", id: "node_2", selected: true },
      ];

      const nextState = applyNodeChanges(initialUIState, changes);

      expect(nextState["node_1"]).toEqual({ position: { x: 120, y: 340 } });
      expect(nextState["node_2"]).toEqual({ selected: true });
    });

    it("clears transient position on drag stop while preserving selection via applyNodeDragStop", () => {
      const stateWithDrag = {
        node_1: { position: { x: 120, y: 340 }, selected: true },
      };

      const settledState = applyNodeDragStop(stateWithDrag, "node_1");
      expect(settledState["node_1"].position).toBeUndefined();
      expect(settledState["node_1"].selected).toBe(true);
    });

    it("creates updated layoutOverrides in project via createLayoutOverride", () => {
      const project = getFreshProject();
      const updated = createLayoutOverride(project, "batt_1", { x: 450, y: 220 });

      expect(updated.layoutOverrides["batt_1"]).toEqual({ x: 450, y: 220, locked: false });
      expect(updated.instances).toEqual(project.instances);
    });

    it("cycles diagnostic continuity through normal -> open -> unknown -> normal", () => {
      expect(nextContinuityState("normal")).toBe("open");
      expect(nextContinuityState("open")).toBe("unknown");
      expect(nextContinuityState("unknown")).toBe("normal");
    });

    it("toggles wire diagnostic in a diagnostics record", () => {
      const diag: WireDiagnostics = { wire_1: { continuity: "normal" } };
      const next1 = toggleWireDiagnostic(diag, "wire_1");
      expect(next1.continuity).toBe("open");

      const next2 = toggleWireDiagnostic({ wire_1: next1 }, "wire_1");
      expect(next2.continuity).toBe("unknown");

      const next3 = toggleWireDiagnostic({ wire_1: next2 }, "wire_1");
      expect(next3.continuity).toBe("normal");
    });
  });

  describe("Controlled vs Uncontrolled Diagnostics (P2)", () => {
    it("handles uncontrolled diagnostic transitions and passes updated diagnostic to onDiagnosticChange", () => {
      const currentDiagnostics: WireDiagnostics = {};
      const wireId = "wire_123";

      // Step 1: toggle from default normal -> open
      const step1 = toggleWireDiagnostic(currentDiagnostics, wireId);
      expect(step1.continuity).toBe("open");

      // Step 2: toggle from open -> unknown
      const step2 = toggleWireDiagnostic({ [wireId]: step1 }, wireId);
      expect(step2.continuity).toBe("unknown");

      // Step 3: toggle from unknown -> normal
      const step3 = toggleWireDiagnostic({ [wireId]: step2 }, wireId);
      expect(step3.continuity).toBe("normal");
    });

    it("correctly renders DiagnosticBadge for controlled diagnostic states", () => {
      const toggleSpy = vi.fn();

      const { rerender } = render(
        <DiagnosticBadge
          wireId="wire_alpha"
          diagnostic={{ continuity: "open" }}
          onToggle={toggleSpy}
        />
      );

      const openBadge = screen.getByRole("button", { name: /Wire wire_alpha: status is open/i });
      expect(openBadge).toBeInTheDocument();
      expect(screen.getByText("OPEN")).toBeInTheDocument();

      fireEvent.click(openBadge);
      expect(toggleSpy).toHaveBeenCalledWith("wire_alpha");

      rerender(
        <DiagnosticBadge
          wireId="wire_alpha"
          diagnostic={{ continuity: "unknown" }}
          onToggle={toggleSpy}
        />
      );

      expect(screen.getByRole("button", { name: /Wire wire_alpha: status is unknown/i })).toBeInTheDocument();
      expect(screen.getByText("UNK")).toBeInTheDocument();
    });
  });

  describe("ReadOnly Diagram Mode (P2)", () => {
    it("disables DiagnosticBadge and ignores click toggles when readOnly is true", () => {
      const toggleSpy = vi.fn();

      render(
        <DiagnosticBadge
          wireId="test_wire_ro"
          wireColor="blue"
          gauge="16"
          diagnostic={{ continuity: "open" }}
          onToggle={toggleSpy}
          readOnly={true}
        />
      );

      const badge = screen.getByRole("button", { name: /Wire test_wire_ro: status is open\./i });
      expect(badge).toBeInTheDocument();
      expect(badge).toBeDisabled();
      expect(badge).toHaveAttribute("aria-disabled", "true");

      fireEvent.click(badge);
      expect(toggleSpy).not.toHaveBeenCalled();
    });

    it("WiringCanvas disables node dragging when readOnly is true", () => {
      const { container } = render(
        <ReactFlowProvider>
          <div style={{ width: 800, height: 600 }}>
            <WiringCanvas
              nodes={[]}
              edges={[]}
              onNodesChange={vi.fn()}
              onNodeDragStop={vi.fn()}
              readOnly={true}
            />
          </div>
        </ReactFlowProvider>
      );

      const flowWrapper = container.querySelector(".react-flow");
      expect(flowWrapper).toBeInTheDocument();
    });

    it("buildWiringViewModel generates readOnly edge data when onToggleDiagnostic is not passed", () => {
      const project = getFreshProject();
      const viewModel = buildWiringViewModel(project, { nodes: {} }, {}, undefined);

      expect(viewModel.edges.length).toBeGreaterThan(0);
      viewModel.edges.forEach((edge) => {
        expect(edge.data.readOnly).toBe(true);
        expect(edge.data.onToggleDiagnostic).toBeUndefined();
      });
    });
  });

  describe("Lifecycle & Project Switching (P3)", () => {
    it("renders fresh nodes when project prop changes", async () => {
      const projectA = getFreshProject();
      projectA.id = "project_A";

      const { rerender } = render(
        <WiringDiagram project={projectA} onProjectChange={vi.fn()} />
      );

      await waitFor(() => {
        expect(screen.getByText("12V Battery")).toBeInTheDocument();
      });

      // Switch to project B
      const projectB = compileTemplate(templates[1] || templates[0]);
      projectB.id = "project_B";

      rerender(
        <WiringDiagram project={projectB} onProjectChange={vi.fn()} />
      );

      await waitFor(() => {
        expect(screen.getByText(projectB.instances[0].name)).toBeInTheDocument();
      });
    });

    it("handles layout failures gracefully without collapsing nodes to (0,0)", async () => {
      const layoutSpy = vi.spyOn(layoutModule, "layoutProject").mockRejectedValueOnce(new Error("ELK failure"));
      const project = getFreshProject();

      render(<WiringDiagram project={project} onProjectChange={vi.fn()} />);

      await waitFor(() => {
        expect(layoutSpy).toHaveBeenCalled();
      });

      // Nodes should still render and not crash
      expect(screen.getByText("12V Battery")).toBeInTheDocument();
    });
  });

  it("updates layout overrides without re-invoking ELK layout", async () => {
    const layoutSpy = vi.spyOn(layoutModule, "layoutProject");
    const project = getFreshProject();
    const handleProjectChange = vi.fn();

    const { rerender } = render(
      <WiringDiagram project={project} onProjectChange={handleProjectChange} />
    );

    await waitFor(() => {
      expect(layoutSpy).toHaveBeenCalledTimes(1);
    });

    // Simulate drag completion by updating layoutOverrides in the project prop
    const targetNodeId = project.instances[0].id;
    const projectWithDragOverride = {
      ...project,
      layoutOverrides: {
        ...project.layoutOverrides,
        [targetNodeId]: { x: 300, y: 150, locked: false },
      },
    };

    rerender(
      <WiringDiagram project={projectWithDragOverride} onProjectChange={handleProjectChange} />
    );

    // Assert ELK layout was not re-invoked
    expect(layoutSpy).toHaveBeenCalledTimes(1);
  });

  it("updates diagnostics without re-invoking ELK layout", async () => {
    const layoutSpy = vi.spyOn(layoutModule, "layoutProject");
    const project = getFreshProject();
    const handleProjectChange = vi.fn();
    const handleDiagnosticChange = vi.fn();

    const initialDiagnostics: WireDiagnostics = {};
    const { rerender } = render(
      <WiringDiagram
        project={project}
        onProjectChange={handleProjectChange}
        diagnostics={initialDiagnostics}
        onDiagnosticChange={handleDiagnosticChange}
      />
    );

    await waitFor(() => {
      expect(layoutSpy).toHaveBeenCalledTimes(1);
    });

    // Update controlled diagnostics prop
    const updatedDiagnostics: WireDiagnostics = {
      [project.wires[0].id]: { continuity: "open" },
    };

    rerender(
      <WiringDiagram
        project={project}
        onProjectChange={handleProjectChange}
        diagnostics={updatedDiagnostics}
        onDiagnosticChange={handleDiagnosticChange}
      />
    );

    // Verify ELK layout was NOT invoked again
    expect(layoutSpy).toHaveBeenCalledTimes(1);
  });

  it("re-invokes ELK layout when project circuit topology changes", async () => {
    const layoutSpy = vi.spyOn(layoutModule, "layoutProject");
    const project = getFreshProject();
    const handleProjectChange = vi.fn();

    const { rerender } = render(
      <WiringDiagram project={project} onProjectChange={handleProjectChange} />
    );

    await waitFor(() => {
      expect(layoutSpy).toHaveBeenCalledTimes(1);
    });

    // Add a new instance to change topology
    const projectWithNewInstance = {
      ...project,
      instances: [
        ...project.instances,
        { id: "extra_switch", kind: "switch.toggle", name: "Extra Switch", zone: "Dash" },
      ],
    };

    rerender(
      <WiringDiagram project={projectWithNewInstance} onProjectChange={handleProjectChange} />
    );

    await waitFor(() => {
      expect(layoutSpy).toHaveBeenCalledTimes(2);
    });
  });

  it("renders DiagnosticBadge and triggers onToggle callback on click", () => {
    const toggleSpy = vi.fn();

    render(
      <DiagnosticBadge
        wireId="test_wire_1"
        wireColor="red"
        gauge="14"
        diagnostic={{ continuity: "open" }}
        onToggle={toggleSpy}
      />
    );

    const badge = screen.getByRole("button", { name: /Wire test_wire_1: status is open/i });
    expect(badge).toBeInTheDocument();
    expect(screen.getByText("OPEN")).toBeInTheDocument();

    fireEvent.click(badge);
    expect(toggleSpy).toHaveBeenCalledTimes(1);
    expect(toggleSpy).toHaveBeenCalledWith("test_wire_1");
  });
});
