import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
import "@testing-library/jest-dom";
import { compileTemplate } from "../compiler/compiler";
import { templates } from "../catalog/components";
import { WiringDiagram } from "../wiring/WiringDiagram";
import * as CanvasModule from "../wiring/WiringCanvas";

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
    const validCandidate = {
      source: batt.id,
      sourceHandle: "pos",
      target: fuse.id,
      targetHandle: "in",
    };
    expect(capturedPropsFresh?.isValidConnection?.(validCandidate as any)).toBe(true);

    // 2. Direction invalid: target-to-target (fuse.in -> lamp.in)
    const targetToTarget = {
      source: fuse.id,
      sourceHandle: "in",
      target: lamp.id,
      targetHandle: "in",
    };
    expect(capturedPropsFresh?.isValidConnection?.(targetToTarget as any)).toBe(false);

    // 3. Short circuit: battery.pos (source) -> ground.gnd (target)
    const deadShort = {
      source: batt.id,
      sourceHandle: "pos",
      target: ground.id,
      targetHandle: "gnd",
    };
    expect(capturedPropsFresh?.isValidConnection?.(deadShort as any)).toBe(false);
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
    };

    const newConnection = {
      source: wireToReconnect.sourceInstance,
      sourceHandle: wireToReconnect.sourcePort,
      target: "splice_1",
      targetHandle: "t1",
    };

    act(() => {
      capturedProps?.onReconnect?.(oldEdge as any, newConnection as any);
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
      capturedProps?.onNodesDelete?.([{ id: batt.id } as any]);
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
      capturedProps?.onEdgesDelete?.([{ id: wireToDelete.id } as any]);
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
});
