import { describe, it, expect } from "vitest";
import { compileTemplate } from "../compiler/compiler";
import { templates } from "../catalog/components";
import { buildWiringViewModel, WiringLayoutResult } from "../wiring";
import { SimulationResult } from "../domain/simulation/types";

describe("Wiring Project Adapter & View Model Builder", () => {
  const sampleProject = { ...compileTemplate(templates[0]), layoutOverrides: {} };
  const mockLayoutResult: WiringLayoutResult = {
    nodes: {
      [sampleProject.instances[0].id]: { id: sampleProject.instances[0].id, x: 50, y: 100, width: 150, height: 70 },
      [sampleProject.instances[1].id]: { id: sampleProject.instances[1].id, x: 250, y: 100, width: 150, height: 70 },
    },
  };

  it("builds a complete WiringViewModel from project and layout positions", () => {
    const viewModel = buildWiringViewModel(sampleProject, mockLayoutResult);

    expect(viewModel.nodes.length).toBe(sampleProject.instances.length);
    expect(viewModel.edges.length).toBe(sampleProject.wires.length);

    const firstNode = viewModel.nodes[0];
    expect(firstNode.type).toBe("component");
    expect(firstNode.position).toEqual({ x: 50, y: 100 });
    expect(firstNode.data.name).toBe(sampleProject.instances[0].name);

    const firstEdge = viewModel.edges[0];
    expect(firstEdge.type).toBe("diagnostic");
    expect(firstEdge.source).toBe(sampleProject.wires[0].sourceInstance);
    expect(firstEdge.target).toBe(sampleProject.wires[0].targetInstance);
  });

  it("prioritizes layout overrides over ELK calculated positions", () => {
    const projectWithOverrides = {
      ...sampleProject,
      layoutOverrides: {
        [sampleProject.instances[0].id]: { x: 999, y: 888, locked: true },
      },
    };

    const viewModel = buildWiringViewModel(projectWithOverrides, mockLayoutResult);
    const overriddenNode = viewModel.nodes.find((n) => n.id === sampleProject.instances[0].id);

    expect(overriddenNode?.position).toEqual({ x: 999, y: 888 });
  });

  it("falls back gracefully with deterministic coordinates when layout result does not contain an instance", () => {
    const emptyLayoutResult: WiringLayoutResult = { nodes: {} };
    const viewModel = buildWiringViewModel(sampleProject, emptyLayoutResult);

    expect(viewModel.nodes[0].position).toEqual({ x: 50, y: 50 });
    expect(viewModel.nodes[1].position.x).toBeGreaterThan(viewModel.nodes[0].position.x);
  });
});

describe("buildWiringViewModel priority styling", () => {
  it("applies simulation state correctly while respecting faults", () => {
    const project = {
      id: "p1",
      schemaVersion: "3.0" as const,
      ruleSetVersion: "1",
      metadata: { name: "test" },
      instances: [
        { id: "lamp1", kind: "lamp.incandescent", name: "Lamp", zone: "Dash" }
      ],
      wires: [
        { id: "w1", sourceInstance: "bat", sourcePort: "pos", targetInstance: "lamp1", targetPort: "in", a: {instanceId: "bat", terminalKey: "pos"}, b: {instanceId: "lamp1", terminalKey: "in"} },
        { id: "w2", sourceInstance: "lamp1", sourcePort: "ground", targetInstance: "gnd", targetPort: "gnd", a: {instanceId: "lamp1", terminalKey: "ground"}, b: {instanceId: "gnd", terminalKey: "gnd"} }
      ],
      assemblies: [],
      circuits: [],
      layoutOverrides: {},
      annotations: []
    };

    const simRes = {
      wireStates: {
        "w1": { hasPower: true, hasGround: false, isShorted: false },
        "w2": { hasPower: false, hasGround: true, isShorted: false }
      },
      terminalStates: {},
      activeComponents: ["lamp1"],
      shortedComponents: [],
      backfeedComponents: [],
      backfeedTerminals: []
    };

    const vm = buildWiringViewModel(project, { nodes: {} }, { "w1": { continuity: "open" } }, undefined, null, simRes as SimulationResult);

    const w1 = vm.edges.find(e => e.id === "w1")!;
    const w2 = vm.edges.find(e => e.id === "w2")!;
    const lamp = vm.nodes.find(n => n.id === "lamp1")!;

    // Fault overrides sim
    expect(w1.style!.stroke).toBe("#dc2626"); // open diagnostic color
    expect(w1.style!.strokeDasharray).toBe("6,6");

    // Sim applies to w2 (green for grounded)
    expect(w2.style!.stroke).toBe("#22c55e");

    // Component mapped to simActive
    expect(lamp.data.simActive).toBe(true);
  });
});
