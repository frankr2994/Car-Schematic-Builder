import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
import "@testing-library/jest-dom";
import { Connection, Edge, Node } from "@xyflow/react";
import { compileTemplate } from "../compiler/compiler";
import { templates } from "../catalog/components";
import { WiringDiagram } from "../wiring/WiringDiagram";
import * as CanvasModule from "../wiring/WiringCanvas";
import { parseProject } from "../domain/validation";
import { addAnnotation } from "../domain/projectCommands";


// Mock ResizeObserver for JSDOM
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock;

describe("Wiring Diagram Interactive Callbacks & Editing Lifecycle", () => {
  const getFreshProject = () => compileTemplate(templates[0]);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("evaluates isValidConnection for valid, direction-invalid, and short-circuit candidates", async () => {
    const project = getFreshProject();
    const batt = project.instances.find((i) => i.kind === "battery.12v")!;
    const fuse = project.instances.find((i) => i.kind === "fuse.blade")!;
    const ground = project.instances.find((i) => i.kind === "ground.chassis")!;
    const lamp = project.instances.find((i) => i.kind === "lamp.incandescent")!;

    const projWithoutWires = { ...project, wires: [] };
    let capturedPropsFresh: CanvasModule.WiringCanvasProps | undefined;
    vi.spyOn(CanvasModule, "WiringCanvas").mockImplementation((props) => {
      capturedPropsFresh = props;
      return <div className="mock-wiring-canvas" />;
    });

    render(<WiringDiagram project={projWithoutWires} onProjectChange={vi.fn()} />);

    expect(capturedPropsFresh).toBeDefined();
    expect(capturedPropsFresh?.isValidConnection).toBeDefined();

    // 1. Valid connection: battery.pos (source) -> fuse.in (target) without existing wire
    const validCandidate: Connection = {
      source: batt.id,
      sourceHandle: "pos",
      target: fuse.id,
      targetHandle: "in",
    };
    expect(capturedPropsFresh?.isValidConnection?.(validCandidate)).toBe(true);

    // 2. Direction invalid: target-to-target (fuse.in -> lamp.in)
    const targetToTarget: Connection = {
      source: fuse.id,
      sourceHandle: "in",
      target: lamp.id,
      targetHandle: "in",
    };
    expect(capturedPropsFresh?.isValidConnection?.(targetToTarget)).toBe(false);

    // 3. Short circuit: battery.pos (source) -> ground.gnd (target)
    const deadShort: Connection = {
      source: batt.id,
      sourceHandle: "pos",
      target: ground.id,
      targetHandle: "gnd",
    };
    expect(capturedPropsFresh?.isValidConnection?.(deadShort)).toBe(false);
  });

  it("executes onConnect and commits the new wire to onProjectChange", () => {
    let capturedProps: CanvasModule.WiringCanvasProps | undefined;
    vi.spyOn(CanvasModule, "WiringCanvas").mockImplementation((props) => {
      capturedProps = props;
      return <div className="mock-wiring-canvas" />;
    });

    const project = getFreshProject();
    const handleProjectChange = vi.fn();
    const handleSelectionChange = vi.fn();

    // Project with no wires initially
    const projWithoutWires = { ...project, wires: [] };
    render(
      <WiringDiagram
        project={projWithoutWires}
        onProjectChange={handleProjectChange}
        onSelectionChange={handleSelectionChange}
      />
    );

    const batt = project.instances.find((i) => i.kind === "battery.12v")!;
    const fuse = project.instances.find((i) => i.kind === "fuse.blade")!;

    act(() => {
      capturedProps?.onConnect?.({
        source: batt.id,
        sourceHandle: "pos",
        target: fuse.id,
        targetHandle: "in",
      });
    });

    expect(handleProjectChange).toHaveBeenCalledTimes(1);
    const updatedProject = handleProjectChange.mock.calls[0][0];
    expect(updatedProject.wires.length).toBe(1);
    expect(updatedProject.wires[0].sourceInstance).toBe(batt.id);
    expect(updatedProject.wires[0].targetInstance).toBe(fuse.id);
    expect(handleSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "wire", id: updatedProject.wires[0].id })
    );
  });

  it("executes onReconnect and updates wire endpoints in onProjectChange", () => {
    let capturedProps: CanvasModule.WiringCanvasProps | undefined;
    vi.spyOn(CanvasModule, "WiringCanvas").mockImplementation((props) => {
      capturedProps = props;
      return <div className="mock-wiring-canvas" />;
    });

    const project = getFreshProject();
    const handleProjectChange = vi.fn();

    // Add a 3-way splice to reconnect to
    const projectWithSplice = {
      ...project,
      instances: [
        ...project.instances,
        { id: "splice_1", kind: "splice.3way", name: "Splice Block", zone: "Engine Bay" },
      ],
    };

    render(
      <WiringDiagram project={projectWithSplice} onProjectChange={handleProjectChange} />
    );

    const wireToReconnect = projectWithSplice.wires[0];
    const oldEdge = {
      id: wireToReconnect.id,
      source: wireToReconnect.sourceInstance,
      sourceHandle: wireToReconnect.sourcePort,
      target: wireToReconnect.targetInstance,
      targetHandle: wireToReconnect.targetPort,
    } as unknown as Edge;

    const newConnection: Connection = {
      source: wireToReconnect.sourceInstance,
      sourceHandle: wireToReconnect.sourcePort,
      target: "splice_1",
      targetHandle: "t1",
    };

    act(() => {
      capturedProps?.onReconnect?.(oldEdge, newConnection);
    });

    expect(handleProjectChange).toHaveBeenCalledTimes(1);
    const updatedProject = handleProjectChange.mock.calls[0][0];
    const reconnected = updatedProject.wires.find((w: { id: string }) => w.id === wireToReconnect.id);
    expect(reconnected?.targetInstance).toBe("splice_1");
    expect(reconnected?.targetPort).toBe("t1");
  });

  it("executes onNodesDelete and cascade-deletes attached wires and layout overrides", () => {
    let capturedProps: CanvasModule.WiringCanvasProps | undefined;
    vi.spyOn(CanvasModule, "WiringCanvas").mockImplementation((props) => {
      capturedProps = props;
      return <div className="mock-wiring-canvas" />;
    });

    const project = getFreshProject();
    const handleProjectChange = vi.fn();
    const handleSelectionChange = vi.fn();
    const batt = project.instances[0];

    const projectWithOverrides = {
      ...project,
      layoutOverrides: {
        [batt.id]: { x: 200, y: 150, locked: false },
      },
    };

    render(
      <WiringDiagram
        project={projectWithOverrides}
        onProjectChange={handleProjectChange}
        onSelectionChange={handleSelectionChange}
      />
    );

    act(() => {
      capturedProps?.onNodesDelete?.([{ id: batt.id } as unknown as Node]);
    });

    expect(handleProjectChange).toHaveBeenCalledTimes(1);
    const updatedProject = handleProjectChange.mock.calls[0][0];

    // Battery instance removed
    expect(updatedProject.instances.some((i: { id: string }) => i.id === batt.id)).toBe(false);
    // All wires connected to battery cascade-deleted
    expect(
      updatedProject.wires.some(
        (w: { sourceInstance: string; targetInstance: string }) =>
          w.sourceInstance === batt.id || w.targetInstance === batt.id
      )
    ).toBe(false);
    // Layout override removed
    expect(updatedProject.layoutOverrides[batt.id]).toBeUndefined();
    // Selection reset
    expect(handleSelectionChange).toHaveBeenCalledWith(null);
  });

  it("executes onNodesDelete with annotation node and calls deleteAnnotation", () => {
    let capturedProps: CanvasModule.WiringCanvasProps | undefined;
    vi.spyOn(CanvasModule, "WiringCanvas").mockImplementation((props) => {
      capturedProps = props;
      return <div className="mock-wiring-canvas" />;
    });

    const project = getFreshProject();
    const projectWithAnn = {
      ...project,
      annotations: [
        {
          id: "ann_123",
          type: "text" as const,
          anchor: { kind: "canvas" as const, x: 100, y: 100 },
          text: "Canvas Note",
          severity: "note" as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    const handleProjectChange = vi.fn();
    const handleSelectionChange = vi.fn();

    render(
      <WiringDiagram
        project={projectWithAnn}
        onProjectChange={handleProjectChange}
        onSelectionChange={handleSelectionChange}
      />
    );

    act(() => {
      capturedProps?.onNodesDelete?.([{ id: "ann_123", type: "annotation" } as unknown as Node]);
    });

    expect(handleProjectChange).toHaveBeenCalledTimes(1);
    const updatedProject = handleProjectChange.mock.calls[0][0];
    expect(updatedProject.annotations.length).toBe(0);
    expect(handleSelectionChange).toHaveBeenCalledWith(null);
  });

  it("executes onEdgesDelete and removes the wire from onProjectChange", () => {
    let capturedProps: CanvasModule.WiringCanvasProps | undefined;
    vi.spyOn(CanvasModule, "WiringCanvas").mockImplementation((props) => {
      capturedProps = props;
      return <div className="mock-wiring-canvas" />;
    });

    const project = getFreshProject();
    const handleProjectChange = vi.fn();
    const wireToDelete = project.wires[0];

    render(
      <WiringDiagram project={project} onProjectChange={handleProjectChange} />
    );

    act(() => {
      capturedProps?.onEdgesDelete?.([{ id: wireToDelete.id } as unknown as Edge]);
    });

    expect(handleProjectChange).toHaveBeenCalledTimes(1);
    const updatedProject = handleProjectChange.mock.calls[0][0];
    expect(updatedProject.wires.length).toBe(project.wires.length - 1);
    expect(updatedProject.wires.some((w: { id: string }) => w.id === wireToDelete.id)).toBe(false);
  });

  it("handles drop event from palette to place a component", async () => {
    const project = getFreshProject();
    const handleProjectChange = vi.fn();
    const handleSelectionChange = vi.fn();

    const { container } = render(
      <WiringDiagram
        project={project}
        onProjectChange={handleProjectChange}
        onSelectionChange={handleSelectionChange}
      />
    );

    const reactFlowWrapper = container.querySelector(".react-flow");
    expect(reactFlowWrapper).toBeInTheDocument();

    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        getData: (type: string) => (type === "application/reactflow-component-kind" ? "relay.spdt" : ""),
      },
    });
    Object.defineProperty(dropEvent, "clientX", { value: 300 });
    Object.defineProperty(dropEvent, "clientY", { value: 200 });

    fireEvent(reactFlowWrapper!, dropEvent);

    await waitFor(() => {
      expect(handleProjectChange).toHaveBeenCalled();
    });

    const updatedProject = handleProjectChange.mock.calls[0][0];
    expect(updatedProject.instances.some((i: { kind: string }) => i.kind === "relay.spdt")).toBe(true);
    expect(handleSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "component" })
    );
  });

  it("ignores ambiguous or unchanged reconnection attempts", () => {
    let capturedProps: CanvasModule.WiringCanvasProps | undefined;
    vi.spyOn(CanvasModule, "WiringCanvas").mockImplementation((props) => {
      capturedProps = props;
      return <div className="mock-wiring-canvas" />;
    });

    const project = getFreshProject();
    const handleProjectChange = vi.fn();

    render(
      <WiringDiagram project={project} onProjectChange={handleProjectChange} />
    );

    const wire = project.wires[0];
    const oldEdge = {
      id: wire.id,
      source: wire.sourceInstance,
      sourceHandle: wire.sourcePort,
      target: wire.targetInstance,
      targetHandle: wire.targetPort,
    } as unknown as Edge;

    // Case 1: Unchanged connection (neither endpoint changed)
    act(() => {
      capturedProps?.onReconnect?.(oldEdge, {
        source: wire.sourceInstance,
        sourceHandle: wire.sourcePort,
        target: wire.targetInstance,
        targetHandle: wire.targetPort,
      });
    });
    expect(handleProjectChange).not.toHaveBeenCalled();

    // Case 2: Ambiguous connection (both endpoints changed)
    act(() => {
      capturedProps?.onReconnect?.(oldEdge, {
        source: "other_1",
        sourceHandle: "p1",
        target: "other_2",
        targetHandle: "p2",
      });
    });
    expect(handleProjectChange).not.toHaveBeenCalled();
  });

  it("dispatches canvas annotation drags to updateAnnotation without corrupting layoutOverrides", () => {
    let capturedProps: CanvasModule.WiringCanvasProps | undefined;
    vi.spyOn(CanvasModule, "WiringCanvas").mockImplementation((props) => {
      capturedProps = props;
      return <div className="mock-wiring-canvas" />;
    });

    let project = getFreshProject();
    const annRes = addAnnotation(project, {
      id: "ann_canvas_drag_test",
      anchor: { kind: "canvas", x: 100, y: 100 },
      text: "Draggable canvas note",
      severity: "note",
    });
    expect(annRes.ok).toBe(true);
    if (!annRes.ok) return;
    project = annRes.project;

    const handleProjectChange = vi.fn();
    render(
      <WiringDiagram project={project} onProjectChange={handleProjectChange} />
    );

    expect(capturedProps?.onNodeDragStop).toBeDefined();

    // Simulate dragging the annotation node to (350, 450)
    const annotationNode: Node = {
      id: "ann_canvas_drag_test",
      type: "annotation",
      position: { x: 350, y: 450 },
      data: {},
    };

    act(() => {
      capturedProps?.onNodeDragStop?.({} as React.MouseEvent, annotationNode);
    });

    expect(handleProjectChange).toHaveBeenCalledTimes(1);
    const updatedProject = handleProjectChange.mock.calls[0][0];

    // Verify annotation anchor was updated
    const updatedAnn = updatedProject.annotations.find((a: { id: string }) => a.id === "ann_canvas_drag_test");
    expect(updatedAnn?.anchor).toEqual({ kind: "canvas", x: 350, y: 450 });

    // CRITICAL: Verify layoutOverrides was NOT corrupted with annotation ID
    expect(updatedProject.layoutOverrides["ann_canvas_drag_test"]).toBeUndefined();

    // Verify document validation passes
    const val = parseProject(updatedProject);
    expect(val.success).toBe(true);
  });

  it("highlights target component and wire when an annotation is selected", () => {
    let capturedProps: CanvasModule.WiringCanvasProps | undefined;
    vi.spyOn(CanvasModule, "WiringCanvas").mockImplementation((props) => {
      capturedProps = props;
      return <div className="mock-wiring-canvas" />;
    });

    let project = getFreshProject();
    const lamp = project.instances.find((i) => i.kind === "lamp.incandescent")!;
    const wire = project.wires[0];

    const annRes1 = addAnnotation(project, {
      id: "ann_lamp_hotspot",
      anchor: { kind: "component", componentId: lamp.id },
      text: "Lamp issue",
    });
    if (annRes1.ok) project = annRes1.project;

    const annRes2 = addAnnotation(project, {
      id: "ann_wire_hotspot",
      anchor: { kind: "wire", wireId: wire.id },
      text: "Wire check",
    });
    if (annRes2.ok) project = annRes2.project;

    // 1. Select component annotation -> verify target component is highlighted (selected)
    const { rerender } = render(
      <WiringDiagram
        project={project}
        onProjectChange={vi.fn()}
        selectedElement={{ kind: "annotation", id: "ann_lamp_hotspot" }}
      />
    );

    const lampNode = capturedProps?.nodes.find((n) => n.id === lamp.id);
    expect(lampNode?.selected).toBe(true);

    // 2. Select wire annotation -> verify target wire is highlighted (selected)
    rerender(
      <WiringDiagram
        project={project}
        onProjectChange={vi.fn()}
        selectedElement={{ kind: "annotation", id: "ann_wire_hotspot" }}
      />
    );

    const wireEdge = capturedProps?.edges.find((e) => e.id === wire.id);
    expect(wireEdge?.selected).toBe(true);
  });
});
