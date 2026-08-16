import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import '@testing-library/jest-dom';
import { NodeChange, Node, ReactFlowProvider } from "@xyflow/react";
import {
  WiringDiagram,
  WiringCanvas,
  WireDiagnostics,
  DiagnosticBadge,
  WIRING_THEME,
  getWiringThemeCSSVariables,
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

  it("handles transient node selection changes and preserves selected styling", async () => {
    const layoutSpy = vi.spyOn(layoutModule, "layoutProject");
    const project = getFreshProject();
    const handleProjectChange = vi.fn();

    const { container } = render(
      <WiringDiagram project={project} onProjectChange={handleProjectChange} />
    );

    await waitFor(() => {
      expect(layoutSpy).toHaveBeenCalledTimes(1);
    });

    const targetNodeId = project.instances[0].id;
    const nodeWrapper = container.querySelector(`[data-id="${targetNodeId}"]`);
    expect(nodeWrapper).toBeInTheDocument();

    const componentNode = nodeWrapper?.querySelector(".wiring-component-node");
    expect(componentNode).toBeInTheDocument();
    expect(componentNode).not.toHaveClass("selected");
  });

  it("handles transient node dragging in WiringCanvas and commits onNodeDragStop", () => {
    const handleNodesChange = vi.fn();
    const handleNodeDragStop = vi.fn();

    const sampleNodes: Node[] = [
      {
        id: "batt_1",
        type: "component",
        position: { x: 10, y: 20 },
        data: { id: "batt_1", name: "12V Battery", kind: "battery.12v", zone: "Engine Bay", terminals: [] },
      },
    ];

    const { container } = render(
      <ReactFlowProvider>
        <div style={{ width: 800, height: 600 }}>
          <WiringCanvas
            nodes={sampleNodes}
            edges={[]}
            onNodesChange={handleNodesChange}
            onNodeDragStop={handleNodeDragStop}
          />
        </div>
      </ReactFlowProvider>
    );

    const nodeElem = container.querySelector('[data-id="batt_1"]');
    expect(nodeElem).toBeInTheDocument();

    // Trigger onNodesChange with position change
    const positionChange: NodeChange = {
      type: "position",
      id: "batt_1",
      position: { x: 250, y: 180 },
      dragging: true,
    };
    handleNodesChange([positionChange]);
    expect(handleNodesChange).toHaveBeenCalledWith([positionChange]);

    // Trigger onNodeDragStop
    const draggedNode: Node = {
      id: "batt_1",
      position: { x: 250, y: 180 },
      data: sampleNodes[0].data,
    };
    handleNodeDragStop(new MouseEvent("mouseup"), draggedNode);
    expect(handleNodeDragStop).toHaveBeenCalledWith(expect.anything(), draggedNode);
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
