import { describe, it, expect } from "vitest";
import { buildWiringViewModel } from "../wiring/projectAdapter";
import { ProjectDocument } from "../domain/types";
import { SimulationResult } from "../domain/simulation/types";

describe("buildWiringViewModel priority styling", () => {
  it("applies simulation state correctly while respecting faults", () => {
    const project: ProjectDocument = {
      id: "p1",
      schemaVersion: "3.0",
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
      layoutOverrides: {}
    };

    const simRes: SimulationResult = {
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

    const vm = buildWiringViewModel(project, { nodes: {} }, { "w1": { continuity: "open" } }, undefined, null, simRes);

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
